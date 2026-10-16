//! 高级文件搜索与 Windows 系统设置检索
//!
//! 本模块参考 Lertaro 的检索设计，围绕「更快、语法更丰富、覆盖系统自带配置」三点改造：
//!
//! - **更快**：按目录建立内存索引并缓存，首次扫描后重复搜索不再遍历文件系统；
//!   过滤与排序阶段使用 rayon 并行执行。
//! - **更多语法**：fzf 风格模糊匹配、多词布尔组合（空格 AND / `|` OR / `!` 排除）、
//!   词修饰符（`^` 前缀、`$` 后缀、`'` 精确、`*` `?` 通配符、`^...$` 完全匹配）
//!   以及查询标记（`:@分类`、`:.扩展名`、`:S/:M/:C/:A` 排序、`:F` 类型过滤、
//!   `::路径`、`:?通配符`）。
//! - **系统自带配置**：内置 Windows 设置页（ms-settings URI）目录，支持中英文关键词
//!   检索并一键直达对应系统设置界面。

use rayon::prelude::*;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

/// 索引缓存有效期（秒）
const INDEX_TTL_SECS: u64 = 300;
/// 单个目录索引的最大条目数，防止超大目录占用过多内存
const MAX_INDEX_ENTRIES: usize = 500_000;
/// 默认返回结果上限
const DEFAULT_LIMIT: usize = 2000;

/* ------------------------------------------------------------------ */
/* 数据结构                                                            */
/* ------------------------------------------------------------------ */

/// 索引中的单个文件/目录条目
#[derive(Clone, Debug)]
pub struct FileEntry {
    /// 完整路径
    pub path: String,
    /// 文件/目录名
    pub name: String,
    /// 小写文件名（预先计算，避免每次匹配重复转换）
    pub name_lower: String,
    /// 小写完整路径（供路径模式匹配使用）
    pub path_lower: String,
    /// 小写扩展名（含点号，如 `.png`）
    pub ext: String,
    /// 是否为目录
    pub is_dir: bool,
    /// 字节大小
    pub size: u64,
    /// 修改时间（Unix 秒）
    pub modified: u64,
    /// 创建时间（Unix 秒）
    pub created: u64,
}

/// 返回给前端的单条搜索结果
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub name: String,
    /// 小写扩展名（含点号），目录为空字符串
    pub ext: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
    /// 匹配得分，越高越相关
    pub score: i32,
}

/// 搜索响应
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    /// 命中的结果（已按相关度/排序规则裁剪到 limit 以内）
    pub results: Vec<SearchHit>,
    /// 索引中的条目总数
    pub indexed_count: usize,
    /// 本次是否使用了缓存的索引
    pub from_cache: bool,
    /// 本次耗时（毫秒）
    pub elapsed_ms: u64,
    /// 查询解析告警（例如无法识别的标记）
    pub warnings: Vec<String>,
}

/// 系统设置项
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingItem {
    pub name: String,
    pub uri: String,
    pub category: String,
}

/* ------------------------------------------------------------------ */
/* 索引缓存                                                            */
/* ------------------------------------------------------------------ */

struct IndexCache {
    entries: Arc<Vec<FileEntry>>,
    built_at: u64,
}

fn index_store() -> &'static Mutex<HashMap<String, IndexCache>> {
    static STORE: OnceLock<Mutex<HashMap<String, IndexCache>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn system_time_to_secs(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// 扫描目录并构建索引条目列表
fn build_index(directory: &str) -> Vec<FileEntry> {
    let root = Path::new(directory);

    let mut paths: Vec<std::path::PathBuf> = Vec::new();
    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        paths.push(entry.path().to_path_buf());
        if paths.len() >= MAX_INDEX_ENTRIES {
            log::warn!(
                "[file_search] 目录 {} 条目数达到上限 {}，已截断",
                directory,
                MAX_INDEX_ENTRIES
            );
            break;
        }
    }

    paths
        .par_iter()
        .filter_map(|p| {
            let name = p.file_name()?.to_str()?.to_string();
            let metadata = p.metadata().ok()?;
            let is_dir = metadata.is_dir();
            let ext = if is_dir {
                String::new()
            } else {
                Path::new(&name)
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| format!(".{}", e.to_lowercase()))
                    .unwrap_or_default()
            };
            let name_lower = name.to_lowercase();
            let path_str = p.to_string_lossy().to_string();
            Some(FileEntry {
                path_lower: path_str.to_lowercase(),
                path: path_str,
                name: name.clone(),
                name_lower,
                ext,
                is_dir,
                size: if is_dir { 0 } else { metadata.len() },
                modified: metadata
                    .modified()
                    .map(system_time_to_secs)
                    .unwrap_or(0),
                created: metadata.created().map(system_time_to_secs).unwrap_or(0),
            })
        })
        .collect()
}

/// 获取目录索引；`refresh` 为 true 时强制重建
///
/// 返回 (条目列表, 是否命中缓存)。条目以 `Arc` 共享，重复搜索不会产生拷贝开销。
fn get_index(directory: &str, refresh: bool) -> (Arc<Vec<FileEntry>>, bool) {
    let store = index_store();
    let now = now_secs();

    if !refresh {
        if let Ok(guard) = store.lock() {
            if let Some(cache) = guard.get(directory) {
                if now.saturating_sub(cache.built_at) < INDEX_TTL_SECS {
                    return (cache.entries.clone(), true);
                }
            }
        }
    }

    let entries = Arc::new(build_index(directory));
    if let Ok(mut guard) = store.lock() {
        // 索引条目可能很大，控制缓存目录数量
        if guard.len() > 8 {
            guard.clear();
        }
        guard.insert(
            directory.to_string(),
            IndexCache {
                entries: entries.clone(),
                built_at: now,
            },
        );
    }
    (entries, false)
}

/* ------------------------------------------------------------------ */
/* 查询解析                                                            */
/* ------------------------------------------------------------------ */

/// 单个查询词及其修饰符
#[derive(Clone, Debug, Default)]
struct Term {
    /// 小写后的查询文本
    text: String,
    /// 是否为排除项（`!` 前缀）
    exclude: bool,
    /// 精确子串匹配（`'` 前缀）
    exact: bool,
    /// 名称前缀匹配（`^`）
    prefix: bool,
    /// 名称后缀匹配（`$`）
    suffix: bool,
}

/// 排序 / 类型过滤标记
#[derive(Clone, Debug)]
struct SortSpec {
    /// S=大小, M=修改时间, C=创建时间, A=访问时间
    field: char,
    /// true 表示降序
    desc: bool,
}

#[derive(Clone, Debug, Default)]
struct ParsedQuery {
    /// 外层 OR，内层 AND
    and_groups: Vec<Vec<Term>>,
    /// 分类过滤（如 doc/img/video）
    classes: Vec<String>,
    /// 扩展名过滤（形如 `.pdf`）
    extensions: Vec<String>,
    /// `:?` 通配符二次过滤
    wildcards: Vec<String>,
    /// `::` 路径模糊过滤
    path_filters: Vec<String>,
    /// 排序规则
    sort: Option<SortSpec>,
    /// `:F` 仅目录，`:-F` 仅文件
    dir_only: Option<bool>,
    /// 盘符或目录限定
    scope: Option<String>,
    /// 解析告警
    warnings: Vec<String>,
}

/// 文件分类预设，与前端下拉保持一致
fn class_extensions(class: &str) -> &'static [&'static str] {
    match class {
        "doc" => &[
            ".doc", ".docx", ".pdf", ".txt", ".ppt", ".pptx", ".xls", ".xlsx", ".csv", ".rtf",
            ".md", ".wps", ".odt", ".ods",
        ],
        "img" => &[
            ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".ico", ".svg", ".tif", ".tiff",
            ".psd",
        ],
        "video" => &[
            ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".m4v", ".webm", ".rmvb",
        ],
        "audio" => &[
            ".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma", ".ape",
        ],
        "zip" => &[
            ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".iso",
        ],
        "code" => &[
            ".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".c", ".cpp", ".h", ".go", ".rs",
            ".rb", ".php", ".cs", ".swift", ".kt", ".vue", ".svelte",
        ],
        _ => &[],
    }
}

/// 将单个词解析为 Term（处理 `'` `^` `$` `!` 修饰符）
fn parse_term(raw: &str, exact_default: bool) -> Term {
    let mut s = raw;
    let mut term = Term::default();

    // `'...'` 引号包裹的短语：整体作为精确子串（不拆分、不启用模糊）
    if s.len() >= 2 && s.starts_with('\'') && s.ends_with('\'') {
        term.exact = true;
        term.text = s[1..s.len() - 1].to_lowercase();
        return term;
    }

    // 排除修饰符（!）
    if let Some(rest) = s.strip_prefix('!') {
        term.exclude = true;
        s = rest;
    }
    // 精确性翻转（'）
    if let Some(rest) = s.strip_prefix('\'') {
        term.exact = true;
        s = rest;
    }
    // 前缀 / 后缀
    if let Some(rest) = s.strip_prefix('^') {
        term.prefix = true;
        s = rest;
    }
    if let Some(rest) = s.strip_suffix('$') {
        term.suffix = true;
        s = rest;
    }

    term.exact = term.exact || exact_default;
    term.text = s.to_lowercase();
    term
}

/// 解析完整查询字符串
fn parse_query(input: &str) -> ParsedQuery {
    let mut pq = ParsedQuery::default();
    let mut rest = input.trim().to_string();

    // 1. 盘符限定：开头形如 `d:` 或 `d:\path`
    if rest.len() >= 2 {
        let bytes = rest.as_bytes();
        if bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
            let drive = rest[..1].to_uppercase();
            let tail = rest[2..].trim_start().to_string();
            pq.scope = Some(format!("{}:\\", drive));
            rest = tail;
        }
    }

    // 2. 查询标记（以空格分隔的 `:` 前缀 token）
    let mut plain_tokens: Vec<String> = Vec::new();
    for token in split_tokens(&rest) {
        if let Some(path) = token.strip_prefix("::") {
            pq.path_filters.push(path.to_lowercase());
        } else if let Some(w) = token.strip_prefix(":?") {
            pq.wildcards.push(w.to_lowercase());
        } else if let Some(body) = token.strip_prefix(':') {
            // 单个 `:` 后可跟多个以逗号分隔的标记，例如 `:@doc,M-`
            let mut recognized = false;
            for part in body.split(',') {
                let part = part.trim();
                if part.is_empty() {
                    continue;
                }
                if let Some(classes) = part.strip_prefix('@') {
                    for c in classes.split('|').filter(|c| !c.is_empty()) {
                        pq.classes.push(c.trim().to_lowercase());
                    }
                    recognized = true;
                } else if let Some(exts) = part.strip_prefix('.') {
                    for e in exts.split('.').filter(|e| !e.is_empty()) {
                        pq.extensions.push(format!(".{}", e.to_lowercase()));
                    }
                    recognized = true;
                } else {
                    let desc = part.contains('-');
                    if let Some(field) = part.chars().find(|c| matches!(c, 'S' | 'M' | 'C' | 'A')) {
                        pq.sort = Some(SortSpec { field, desc });
                        recognized = true;
                    }
                    if part.contains('F') {
                        // `:-F` / `:F-` 仅文件，`:F` 仅目录
                        pq.dir_only = Some(!desc);
                        recognized = true;
                    }
                }
            }
            if !recognized {
                pq.warnings.push(format!("无法识别的查询标记：{}", token));
            }
        } else {
            plain_tokens.push(token);
        }
    }

    // 3. 普通词按空格分组，独立的 `|` 表示 OR（AND 优先于 OR）
    let mut groups: Vec<Vec<Term>> = vec![Vec::new()];
    for token in plain_tokens {
        if token == "|" {
            groups.push(Vec::new());
            continue;
        }
        let term = parse_term(&token, false);
        if !term.text.is_empty() {
            if let Some(last) = groups.last_mut() {
                last.push(term);
            }
        }
    }
    groups.retain(|g| !g.is_empty());
    if groups.is_empty() {
        groups.push(Vec::new());
    }
    pq.and_groups = groups;

    pq
}

/// 按空格切分查询串，保留 `'...'` 引用短语内的空格
///
/// 只有成对出现的引号才进入引用模式；单个 `'` 作为精确匹配修饰符，
/// 不会把其后的空格一并吞掉，从而保证 `'a b` 仍按两个词解析。
fn split_tokens(input: &str) -> Vec<String> {
    let chars: Vec<char> = input.chars().collect();
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quote = false;

    for (i, &ch) in chars.iter().enumerate() {
        match ch {
            '\'' => {
                if in_quote {
                    in_quote = false;
                } else if chars[i + 1..].contains(&'\'') {
                    in_quote = true;
                }
                current.push(ch);
            }
            c if c.is_whitespace() && !in_quote => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            c => current.push(c),
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

/* ------------------------------------------------------------------ */
/* 匹配算法                                                            */
/* ------------------------------------------------------------------ */

/// 判断字符是否为词边界分隔符
fn is_separator(c: char) -> bool {
    matches!(
        c,
        ' ' | '-' | '_' | '.' | '\\' | '/' | '(' | ')' | '[' | ']' | ',' | '+' | '&'
    )
}

/// fzf 风格模糊匹配：pattern 的字符需按顺序出现在 haystack 中
///
/// 命中返回评分（越高越好），未命中返回 None
fn fuzzy_score(pattern: &str, haystack: &str) -> Option<i32> {
    if pattern.is_empty() {
        return Some(0);
    }
    let hay: Vec<char> = haystack.chars().collect();
    let mut cursor = 0usize;
    let mut score = 0i32;
    let mut prev: Option<usize> = None;
    let mut first: Option<usize> = None;

    for pc in pattern.chars() {
        let mut found = None;
        for i in cursor..hay.len() {
            if hay[i] == pc {
                found = Some(i);
                break;
            }
        }
        let idx = found?;

        // 连续命中加分
        if let Some(p) = prev {
            if idx == p + 1 {
                score += 12;
            }
        }
        // 词首命中加分
        if idx == 0 || is_separator(hay[idx - 1]) {
            score += 10;
        }
        // 越靠近开头越好
        score -= (idx.min(200)) as i32;
        if first.is_none() {
            first = Some(idx);
        }
        prev = Some(idx);
        cursor = idx + 1;
    }

    // 覆盖率奖励：命中跨度越紧凑得分越高
    if let (Some(f), Some(p)) = (first, prev) {
        let span = (p - f + 1) as i32;
        score += (100 - span.min(100)) / 2;
    }
    Some(score)
}

/// Windows 通配符匹配，支持 `*` 与 `?`
fn wildcard_match(pattern: &str, text: &str) -> bool {
    let p: Vec<char> = pattern.chars().collect();
    let t: Vec<char> = text.chars().collect();
    // 动态规划：dp[j] 表示 text 前 i 个字符能否匹配 pattern 前 j 个字符
    let mut dp = vec![false; p.len() + 1];
    dp[0] = true;
    for j in 1..=p.len() {
        if p[j - 1] == '*' {
            dp[j] = dp[j - 1];
        }
    }
    for i in 1..=t.len() {
        let mut prev_diag = dp[0];
        dp[0] = false;
        for j in 1..=p.len() {
            let temp = dp[j];
            dp[j] = match p[j - 1] {
                '*' => dp[j] || dp[j - 1],
                '?' => prev_diag,
                c => prev_diag && c.eq_ignore_ascii_case(&t[i - 1]),
            };
            prev_diag = temp;
        }
    }
    dp[p.len()]
}

/// 判断单个词是否命中条目
fn term_matches(term: &Term, entry: &FileEntry) -> bool {
    // 词中包含路径分隔符时，改为匹配完整路径
    let use_path = term.text.contains('\\') || term.text.contains('/');
    let hay: &str = if use_path {
        &entry.path_lower
    } else {
        &entry.name_lower
    };

    let hit = if term.prefix && term.suffix {
        hay == term.text
    } else if term.prefix {
        hay.starts_with(&term.text)
    } else if term.suffix {
        hay.ends_with(&term.text)
    } else if term.text.contains('*') || term.text.contains('?') {
        wildcard_match(&term.text, hay)
    } else if term.exact {
        hay.contains(&term.text)
    } else {
        // 默认使用模糊匹配，失败后再退回子串匹配，保证短词也能命中
        fuzzy_score(&term.text, hay).is_some() || hay.contains(&term.text)
    };

    if term.exclude {
        !hit
    } else {
        hit
    }
}

/// 计算条目的综合得分（用于默认相关度排序）
fn entry_score(entry: &FileEntry, pq: &ParsedQuery) -> i32 {
    let mut score = 0i32;
    for group in &pq.and_groups {
        let mut group_score = 0i32;
        for term in group {
            if term.exclude {
                continue;
            }
            if term.exact || term.prefix || term.suffix {
                group_score += 60;
            } else if let Some(s) = fuzzy_score(&term.text, &entry.name_lower) {
                group_score += s;
            }
        }
        score = score.max(group_score);
    }
    // 名称较短者通常更相关
    score -= (entry.name_lower.chars().count() as i32) / 4;
    score
}

/* ------------------------------------------------------------------ */
/* 过滤与排序                                                          */
/* ------------------------------------------------------------------ */

/// 判断条目是否通过所有二次过滤条件
fn passes_filters(entry: &FileEntry, pq: &ParsedQuery) -> bool {
    // 类型过滤
    if let Some(dir_only) = pq.dir_only {
        if dir_only != entry.is_dir {
            return false;
        }
    }
    // 扩展名过滤自动排除目录
    if !pq.extensions.is_empty() {
        if entry.is_dir || !pq.extensions.iter().any(|e| e == &entry.ext) {
            return false;
        }
    }
    // 分类过滤（多个分类之间为 OR）
    if !pq.classes.is_empty() {
        if entry.is_dir
            || !pq
                .classes
                .iter()
                .any(|c| class_extensions(c).iter().any(|e| *e == entry.ext))
        {
            return false;
        }
    }
    // 通配符二次过滤（多个条件为 OR，`;` 亦作分隔）
    if !pq.wildcards.is_empty() {
        let matched = pq
            .wildcards
            .iter()
            .flat_map(|w| w.split('|').flat_map(|x| x.split(';')))
            .any(|w| !w.is_empty() && wildcard_match(w, &entry.name_lower));
        if !matched {
            return false;
        }
    }
    // 路径模糊过滤：要求祖先目录或自身路径包含该关键词
    if !pq.path_filters.is_empty() {
        if !pq.path_filters.iter().all(|p| {
            entry.path_lower.contains(&p.replace('/', "\\"))
                || entry.name_lower.contains(p.as_str())
        }) {
            return false;
        }
    }
    true
}

/// 按查询条件对结果排序
///
/// 字段含义：N=名称、T=类型（扩展名，目录优先）、S=大小、M=修改时间、C/A=创建/访问时间
fn sort_hits(hits: &mut [SearchHit], sort: Option<&SortSpec>) {
    match sort {
        Some(spec) => match spec.field {
            'N' => hits.sort_by(|a, b| {
                let ord = a.name.to_lowercase().cmp(&b.name.to_lowercase());
                if spec.desc {
                    ord.reverse()
                } else {
                    ord
                }
            }),
            'T' => hits.sort_by(|a, b| {
                // 目录排在前面，其次按扩展名字典序
                let ord = b.is_dir.cmp(&a.is_dir).then(a.ext.cmp(&b.ext));
                if spec.desc {
                    ord.reverse()
                } else {
                    ord
                }
            }),
            'S' => hits.sort_by(|a, b| {
                let ord = a.size.cmp(&b.size);
                if spec.desc {
                    ord.reverse()
                } else {
                    ord
                }
            }),
            'C' | 'A' | 'M' => hits.sort_by(|a, b| {
                let ord = a.modified.cmp(&b.modified);
                if spec.desc {
                    ord.reverse()
                } else {
                    ord
                }
            }),
            _ => hits.sort_by(|a, b| b.score.cmp(&a.score)),
        },
        None => hits.sort_by(|a, b| b.score.cmp(&a.score)),
    }
}

/// 将前端表头点击的排序字段名转换为内部排序代号
fn sort_field_from_str(field: &str) -> Option<char> {
    match field {
        "name" => Some('N'),
        "type" => Some('T'),
        "size" => Some('S'),
        "modified" => Some('M'),
        _ => None,
    }
}

/* ------------------------------------------------------------------ */
/* 对外命令                                                            */
/* ------------------------------------------------------------------ */

/// 高级文件搜索
///
/// - `directory`：搜索根目录
/// - `query`：查询串，支持完整语法
/// - `limit`：返回上限
/// - `refresh`：是否强制刷新索引
#[tauri::command]
pub async fn search_files_advanced(
    directory: String,
    query: String,
    limit: Option<usize>,
    refresh: Option<bool>,
    sort_by: Option<String>,
    sort_desc: Option<bool>,
) -> SearchResponse {
    let start = std::time::Instant::now();
    let max_results = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_INDEX_ENTRIES);

    let trimmed = query.trim();
    if directory.trim().is_empty() || trimmed.is_empty() {
        return SearchResponse {
            results: Vec::new(),
            indexed_count: 0,
            from_cache: false,
            elapsed_ms: start.elapsed().as_millis() as u64,
            warnings: vec![],
        };
    }

    if !Path::new(&directory).exists() {
        return SearchResponse {
            results: Vec::new(),
            indexed_count: 0,
            from_cache: false,
            elapsed_ms: start.elapsed().as_millis() as u64,
            warnings: vec![format!("目录不存在：{}", directory)],
        };
    }

    // 盘符/目录限定优先于传入目录
    let mut pq = parse_query(trimmed);
    // 表头点击的排序优先于查询串中的排序标记
    if let Some(field) = sort_by.as_deref().and_then(sort_field_from_str) {
        pq.sort = Some(SortSpec {
            field,
            desc: sort_desc.unwrap_or(false),
        });
    }
    let effective_dir = pq.scope.clone().unwrap_or_else(|| directory.clone());
    let (entries, from_cache) = get_index(&effective_dir, refresh.unwrap_or(false));
    let indexed_count = entries.len();

    // 并行过滤：先过二次过滤标记，再按 OR 组做 AND 匹配
    let mut hits: Vec<SearchHit> = entries
        .as_slice()
        .par_iter()
        .filter(|entry| {
            if !passes_filters(entry, &pq) {
                return false;
            }
            pq.and_groups
                .iter()
                .any(|group| group.iter().all(|term| term_matches(term, entry)))
        })
        .map(|entry| SearchHit {
            path: entry.path.clone(),
            name: entry.name.clone(),
            ext: entry.ext.clone(),
            is_dir: entry.is_dir,
            size: entry.size,
            modified: entry.modified,
            score: entry_score(entry, &pq),
        })
        .collect();

    let total_matched = hits.len();
    sort_hits(&mut hits, pq.sort.as_ref());
    hits.truncate(max_results);

    if total_matched > max_results {
        log::debug!(
            "[file_search] 命中 {} 条，已裁剪至 {} 条",
            total_matched,
            max_results
        );
    }

    SearchResponse {
        results: hits,
        indexed_count,
        from_cache,
        elapsed_ms: start.elapsed().as_millis() as u64,
        warnings: pq.warnings,
    }
}

/// 清空索引缓存（供前端「刷新」按钮使用）
#[tauri::command]
pub async fn clear_file_index(directory: Option<String>) -> bool {
    if let Ok(mut guard) = index_store().lock() {
        match directory {
            Some(dir) => guard.remove(&dir).is_some(),
            None => {
                let had = !guard.is_empty();
                guard.clear();
                had
            }
        }
    } else {
        false
    }
}

/* ------------------------------------------------------------------ */
/* Windows 系统设置检索                                                */
/* ------------------------------------------------------------------ */

/// 内置 Windows 设置页目录
///
/// 每项为（显示名称, ms-settings URI, 分类, 检索关键词）
const WINDOWS_SETTINGS: &[(&str, &str, &str, &str)] = &[
    // 系统
    ("显示设置", "ms-settings:display", "系统", "display 显示 屏幕 分辨率 亮度 screen"),
    ("夜间模式", "ms-settings:nightlight", "系统", "night light 夜间 护眼 蓝光"),
    ("声音设置", "ms-settings:sound", "系统", "sound 声音 音量 扬声器 麦克风 audio"),
    ("通知和操作", "ms-settings:notifications", "系统", "notification 通知 提醒"),
    ("专注助手", "ms-settings:quiethours", "系统", "focus assist 专注 免打扰"),
    ("电源和睡眠", "ms-settings:powersleep", "系统", "power 电源 睡眠 电池 省电"),
    ("存储设置", "ms-settings:storagesense", "系统", "storage 存储 空间 磁盘 清理"),
    ("多任务处理", "ms-settings:multitasking", "系统", "multitasking 多任务 分屏 虚拟桌面"),
    ("投影到此电脑", "ms-settings:project", "系统", "project 投影 投屏"),
    ("剪贴板", "ms-settings:clipboard", "系统", "clipboard 剪贴板 历史记录"),
    ("远程桌面", "ms-settings:remotedesktop", "系统", "remote desktop 远程 桌面 rdp"),
    ("关于本机", "ms-settings:about", "系统", "about 关于 版本 系统信息"),
    ("系统信息", "ms-settings:about", "系统", "system info 系统信息 配置"),
    ("开发者选项", "ms-settings:developers", "系统", "developer 开发者 调试"),
    // 蓝牙和设备
    ("蓝牙设置", "ms-settings:bluetooth", "蓝牙和设备", "bluetooth 蓝牙 蓝芽 配对"),
    ("打印机和扫描仪", "ms-settings:printers", "蓝牙和设备", "printer 打印机 扫描仪 scanner"),
    ("鼠标设置", "ms-settings:mousetouchpad", "蓝牙和设备", "mouse 鼠标 指针 触控板"),
    ("键盘设置", "ms-settings:keyboard", "蓝牙和设备", "keyboard 键盘 输入"),
    ("触控笔和 Windows Ink", "ms-settings:pen", "蓝牙和设备", "pen 触控笔 ink"),
    ("自动播放", "ms-settings:autoplay", "蓝牙和设备", "autoplay 自动播放 usb"),
    ("USB 设置", "ms-settings:usb", "蓝牙和设备", "usb 接口 设备"),
    ("摄像头设置", "ms-settings:camera", "蓝牙和设备", "camera 摄像头 相机"),
    ("手机连接", "ms-settings:mobile-devices", "蓝牙和设备", "phone 手机 连接"),
    // 网络和 Internet
    ("WLAN 设置", "ms-settings:network-wifi", "网络和 Internet", "wifi wlan 无线 网络 局域网"),
    ("以太网设置", "ms-settings:network-ethernet", "网络和 Internet", "ethernet 以太网 有线 网卡"),
    ("VPN 设置", "ms-settings:network-vpn", "网络和 Internet", "vpn 虚拟专用网络"),
    ("移动热点", "ms-settings:network-mobilehotspot", "网络和 Internet", "hotspot 热点 共享"),
    ("飞行模式", "ms-settings:network-airplanemode", "网络和 Internet", "airplane 飞行 离线"),
    ("代理设置", "ms-settings:network-proxy", "网络和 Internet", "proxy 代理"),
    ("拨号设置", "ms-settings:network-dialup", "网络和 Internet", "dialup 拨号 宽带"),
    ("网络状态", "ms-settings:network-status", "网络和 Internet", "network 网络 状态 连接"),
    ("高级网络设置", "ms-settings:network-advancedsettings", "网络和 Internet", "advanced 高级 网络"),
    // 个性化
    ("背景设置", "ms-settings:personalization-background", "个性化", "background 壁纸 背景 wallpaper"),
    ("颜色设置", "ms-settings:personalization-colors", "个性化", "color 颜色 主题 深色 浅色"),
    ("锁屏界面", "ms-settings:lockscreen", "个性化", "lock screen 锁屏 屏保"),
    ("主题设置", "ms-settings:themes", "个性化", "theme 主题 外观"),
    ("字体设置", "ms-settings:fonts", "个性化", "font 字体"),
    ("任务栏设置", "ms-settings:taskbar", "个性化", "taskbar 任务栏"),
    ("开始菜单设置", "ms-settings:personalization-start", "个性化", "start 开始菜单 启动"),
    // 应用
    ("已安装应用", "ms-settings:appsfeatures", "应用", "apps 应用 软件 卸载 installed"),
    ("默认应用", "ms-settings:defaultapps", "应用", "default apps 默认 关联 打开方式"),
    ("启动应用", "ms-settings:startupapps", "应用", "startup 启动 自启 开机"),
    ("可选功能", "ms-settings:optionalfeatures", "应用", "optional 可选 功能 组件"),
    ("应用权限", "ms-settings:privacy", "应用", "permission 权限 隐私"),
    // 账户
    ("账户信息", "ms-settings:yourinfo", "账户", "account 账户 用户 信息"),
    ("登录选项", "ms-settings:signinoptions", "账户", "sign in 登录 密码 pin 指纹 hello"),
    ("同步设置", "ms-settings:sync", "账户", "sync 同步"),
    ("家庭和其他用户", "ms-settings:otherusers", "账户", "users 用户 家庭 账户"),
    ("工作单位访问", "ms-settings:workplace", "账户", "work 工作 单位"),
    // 时间和语言
    ("日期和时间", "ms-settings:dateandtime", "时间和语言", "date time 日期 时间 时区 时钟"),
    ("语言和区域", "ms-settings:regionlanguage", "时间和语言", "language 语言 区域 输入法"),
    ("语音设置", "ms-settings:speech", "时间和语言", "speech 语音 识别"),
    // 游戏
    ("游戏栏", "ms-settings:gaming-gamebar", "游戏", "game bar 游戏栏"),
    ("游戏模式", "ms-settings:gaming-gamemode", "游戏", "game mode 游戏模式"),
    ("截图和广播", "ms-settings:gaming-gamedvr", "游戏", "capture 截图 录屏 broadcast"),
    ("Xbox 网络", "ms-settings:gaming-xboxnetworking", "游戏", "xbox 网络"),
    // 辅助功能
    ("讲述人", "ms-settings:easeofaccess-narrator", "辅助功能", "narrator 讲述人 朗读"),
    ("放大镜", "ms-settings:easeofaccess-magnifier", "辅助功能", "magnifier 放大镜"),
    ("高对比度", "ms-settings:easeofaccess-highcontrast", "辅助功能", "contrast 对比度 颜色滤镜"),
    ("鼠标指针与触控", "ms-settings:easeofaccess-cursor", "辅助功能", "cursor 指针 触控"),
    ("键盘辅助", "ms-settings:easeofaccess-keyboard", "辅助功能", "keyboard 键盘 粘滞键"),
    // 隐私和安全性
    ("Windows 安全中心", "ms-settings:windowsdefender", "隐私和安全性", "defender 安全 病毒 杀毒 防火墙"),
    ("防火墙和网络保护", "ms-settings:windowsdefender", "隐私和安全性", "firewall 防火墙 网络保护"),
    ("找回我的设备", "ms-settings:findmydevice", "隐私和安全性", "find my device 找回 设备"),
    ("设备加密", "ms-settings:deviceencryption", "隐私和安全性", "encryption 加密 bitlocker"),
    ("位置隐私", "ms-settings:privacy-location", "隐私和安全性", "location 定位 位置"),
    ("相机隐私", "ms-settings:privacy-webcam", "隐私和安全性", "camera 相机 摄像头 隐私"),
    ("麦克风隐私", "ms-settings:privacy-microphone", "隐私和安全性", "microphone 麦克风 隐私"),
    ("更新和安全", "ms-settings:windowsupdate", "隐私和安全性", "update 更新 windows update 升级"),
    // 控制面板
    ("控制面板", "controlpanel", "控制面板", "control panel 控制面板"),
    ("程序与功能", "controlpanel:programs", "控制面板", "programs 程序 卸载"),
    ("设备管理器", "devmgmt.msc", "控制面板", "device manager 设备管理器 驱动 driver"),
    ("网络连接", "controlpanel:network", "控制面板", "network connections 网络连接 适配器"),
    ("电源选项", "controlpanel:power", "控制面板", "power options 电源选项 计划"),
    ("区域设置", "controlpanel:region", "控制面板", "region 区域 语言"),
    ("Internet 选项", "controlpanel:internet", "控制面板", "internet options 选项 代理"),
    ("字体管理", "controlpanel:fonts", "控制面板", "fonts 字体"),
    ("系统属性", "sysdm.cpl", "控制面板", "system properties 系统属性 环境变量 path"),
    ("环境变量", "sysdm.cpl:environment", "控制面板", "environment variables 环境变量 path"),
    // 系统工具
    ("任务管理器", "taskmgr.exe", "系统工具", "task manager 任务管理器 进程 cpu 内存"),
    ("资源监视器", "resmon.exe", "系统工具", "resource monitor 资源监视器"),
    ("服务管理", "services.msc", "系统工具", "services 服务 管理"),
    ("注册表编辑器", "regedit.exe", "系统工具", "registry 注册表 regedit"),
    ("磁盘管理", "diskmgmt.msc", "系统工具", "disk management 磁盘管理 分区"),
    ("计算机管理", "compmgmt.msc", "系统工具", "computer management 计算机管理"),
    ("事件查看器", "eventvwr.msc", "系统工具", "event viewer 事件查看器 日志 log"),
    ("组策略编辑器", "gpedit.msc", "系统工具", "group policy 组策略"),
    ("系统配置", "msconfig.exe", "系统工具", "system configuration 系统配置 msconfig 启动项"),
    ("命令行", "cmd.exe", "系统工具", "cmd command prompt 命令行 终端"),
    ("PowerShell", "powershell.exe", "系统工具", "powershell 终端 脚本"),
    ("远程桌面连接", "mstsc.exe", "系统工具", "remote desktop 远程桌面 mstsc"),
    ("系统还原", "rstrui.exe", "系统工具", "system restore 系统还原 恢复"),
    ("磁盘清理", "cleanmgr.exe", "系统工具", "disk cleanup 磁盘清理 垃圾"),
];

/// 检索 Windows 自带设置项与系统工具
///
/// 空查询返回按分类归组的完整列表
#[tauri::command]
pub async fn search_windows_settings(keyword: String, limit: Option<usize>) -> Vec<SettingItem> {
    let max = limit.unwrap_or(200);
    let kw = keyword.trim().to_lowercase();

    if kw.is_empty() {
        return WINDOWS_SETTINGS
            .iter()
            .take(max)
            .map(|(name, uri, category, _)| SettingItem {
                name: name.to_string(),
                uri: uri.to_string(),
                category: category.to_string(),
            })
            .collect();
    }

    let mut scored: Vec<(i32, SettingItem)> = WINDOWS_SETTINGS
        .iter()
        .filter_map(|(name, uri, category, keywords)| {
            let name_lower = name.to_lowercase();
            let mut score = 0i32;

            if name_lower.contains(&kw) {
                score += 100;
            }
            if let Some(s) = fuzzy_score(&kw, &name_lower) {
                score += s.max(0);
            }
            for kw_part in keywords.split_whitespace() {
                if kw_part.contains(&kw) || kw.contains(kw_part) {
                    score += 40;
                }
            }
            if score <= 0 {
                return None;
            }
            Some((
                score,
                SettingItem {
                    name: name.to_string(),
                    uri: uri.to_string(),
                    category: category.to_string(),
                },
            ))
        })
        .collect();

    scored.sort_by(|a, b| b.0.cmp(&a.0));
    scored
        .into_iter()
        .take(max)
        .map(|(_, item)| item)
        .collect()
}

/// 打开 Windows 设置项
///
/// 仅允许内置目录中出现的目标，避免任意命令执行
#[tauri::command]
pub async fn open_windows_setting(uri: String) -> Result<(), String> {
    if !WINDOWS_SETTINGS.iter().any(|(_, u, _, _)| *u == uri) {
        return Err("不支持的系统设置项".into());
    }
    // 通过 ShellExecute 打开：ms-settings: 协议与 cpl/msc/exe 均可被系统正确分发
    open::that(&uri).map_err(|e| format!("打开失败：{}", e))
}

/* ------------------------------------------------------------------ */
/* 测试                                                                */
/* ------------------------------------------------------------------ */

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(name: &str, ext: &str, is_dir: bool) -> FileEntry {
        FileEntry {
            path: format!("C:\\test\\{}", name),
            name: name.to_string(),
            name_lower: name.to_lowercase(),
            path_lower: format!("c:\\test\\{}", name.to_lowercase()),
            ext: ext.to_string(),
            is_dir,
            size: 1024,
            modified: 0,
            created: 0,
        }
    }

    #[test]
    fn test_fuzzy_match() {
        assert!(fuzzy_score("ltro", "lertaro.exe").is_some());
        assert!(fuzzy_score("vsc", "visual studio code.lnk").is_some());
        assert!(fuzzy_score("zzz", "abc.txt").is_none());
    }

    #[test]
    fn test_wildcard_match() {
        assert!(wildcard_match("*.pdf", "report.pdf"));
        assert!(wildcard_match("img_????.jpg", "img_2024.jpg"));
        assert!(!wildcard_match("*.pdf", "report.pdf.bak"));
    }

    #[test]
    fn test_term_modifiers() {
        let e = entry("IMG_2024.png", ".png", false);
        assert!(term_matches(&parse_term("^img", false), &e));
        assert!(term_matches(&parse_term(".png$", false), &e));
        assert!(!term_matches(&parse_term("!img", false), &e));
        assert!(term_matches(&parse_term("!doc", false), &e));
    }

    #[test]
    fn test_parse_query_markers() {
        let pq = parse_query("report :@doc,M- :.pdf");
        assert_eq!(pq.classes, vec!["doc".to_string()]);
        assert!(pq.extensions.contains(&".pdf".to_string()));
        let sort = pq.sort.expect("应解析出排序规则");
        assert_eq!(sort.field, 'M');
        assert!(sort.desc);
    }

    #[test]
    fn test_and_or_groups() {
        let pq = parse_query("report | summary 2024");
        assert_eq!(pq.and_groups.len(), 2);
        assert_eq!(pq.and_groups[0].len(), 1);
        assert_eq!(pq.and_groups[1].len(), 2);
    }

    #[test]
    fn test_drive_scope() {
        let pq = parse_query("d: report");
        assert_eq!(pq.scope.as_deref(), Some("D:\\"));
        assert_eq!(pq.and_groups[0][0].text, "report");
    }

    #[test]
    fn test_settings_search() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let hits = rt.block_on(search_windows_settings("蓝牙".into(), None));
        assert!(hits.iter().any(|h| h.uri == "ms-settings:bluetooth"));

        let hits_en = rt.block_on(search_windows_settings("env".into(), None));
        assert!(hits_en.iter().any(|h| h.name.contains("环境变量")));
    }

    #[test]
    fn test_quoted_phrase_and_single_quote() {
        // 成对引号：整体作为精确短语，保留内部空格
        let pq = parse_query("'final report'");
        assert_eq!(pq.and_groups.len(), 1);
        assert_eq!(pq.and_groups[0].len(), 1);
        assert!(pq.and_groups[0][0].exact);
        assert_eq!(pq.and_groups[0][0].text, "final report");

        // 单个引号：仅作为精确修饰符，不应吞掉其后的空格
        let pq2 = parse_query("'final report");
        assert_eq!(pq2.and_groups[0].len(), 2);
        assert!(pq2.and_groups[0][0].exact);
        assert_eq!(pq2.and_groups[0][0].text, "final");
        assert_eq!(pq2.and_groups[0][1].text, "report");
    }

    /// 构造 SearchHit 用于排序测试
    fn hit(name: &str, ext: &str, is_dir: bool, size: u64, modified: u64) -> SearchHit {
        SearchHit {
            path: format!("C:\\test\\{}", name),
            name: name.to_string(),
            ext: ext.to_string(),
            is_dir,
            size,
            modified,
            score: 0,
        }
    }

    #[test]
    fn test_sort_field_mapping() {
        assert_eq!(sort_field_from_str("name"), Some('N'));
        assert_eq!(sort_field_from_str("type"), Some('T'));
        assert_eq!(sort_field_from_str("size"), Some('S'));
        assert_eq!(sort_field_from_str("modified"), Some('M'));
        assert_eq!(sort_field_from_str("unknown"), None);
    }

    #[test]
    fn test_sort_hits_by_name_type_size() {
        let mut hits = vec![
            hit("beta.txt", ".txt", false, 30, 3),
            hit("Alpha", "", true, 0, 1),
            hit("gamma.png", ".png", false, 10, 2),
        ];

        // 名称升序：忽略大小写
        sort_hits(&mut hits, Some(&SortSpec {
            field: 'N',
            desc: false,
        }));
        let names: Vec<_> = hits.iter().map(|h| h.name.as_str()).collect();
        assert_eq!(names, vec!["Alpha", "beta.txt", "gamma.png"]);

        // 名称降序
        sort_hits(&mut hits, Some(&SortSpec {
            field: 'N',
            desc: true,
        }));
        assert_eq!(hits[0].name, "gamma.png");

        // 类型升序：目录优先，其余按扩展名字典序
        sort_hits(&mut hits, Some(&SortSpec {
            field: 'T',
            desc: false,
        }));
        let exts: Vec<_> = hits.iter().map(|h| h.ext.as_str()).collect();
        assert_eq!(exts, vec!["", ".png", ".txt"]);

        // 大小升序 / 降序
        sort_hits(&mut hits, Some(&SortSpec {
            field: 'S',
            desc: false,
        }));
        assert_eq!(hits[0].size, 0);
        sort_hits(&mut hits, Some(&SortSpec {
            field: 'S',
            desc: true,
        }));
        assert_eq!(hits[0].name, "beta.txt");
    }

    /// 性能基准（默认忽略，用于验证索引缓存相对重复全量遍历的加速效果）
    ///
    /// 运行方式：
    /// `FILE_SEARCH_BENCH_DIR=<目录> cargo test --lib file_search -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn bench_index_cache() {
        let dir = std::env::var("FILE_SEARCH_BENCH_DIR")
            .unwrap_or_else(|_| "E:\\trae\\tools\\node_modules".to_string());
        if !Path::new(&dir).exists() {
            println!("[基准] 目录不存在，跳过：{}", dir);
            return;
        }

        // 冷启动：扫描目录并建立索引（一次性开销）
        let t_cold = std::time::Instant::now();
        let (entries, from_cache) = get_index(&dir, true);
        let cold = t_cold.elapsed();

        // 缓存命中：重复取索引
        let rounds = 20u32;
        let t_hot = std::time::Instant::now();
        let mut hot_cache_hit = true;
        for _ in 0..rounds {
            let (_, hit) = get_index(&dir, false);
            hot_cache_hit = hot_cache_hit && hit;
        }
        let hot_avg = t_hot.elapsed() / rounds;

        // 改造后的完整流程：取自缓存索引 + 模糊匹配
        let pq = parse_query("ts");
        let t_new = std::time::Instant::now();
        let (cached, hit) = get_index(&dir, false);
        let new_hits = count_matches(cached.as_slice(), &pq);
        let new_total = t_new.elapsed();
        assert!(hit, "重复取索引应命中缓存");

        // 改造前的完整流程：每次搜索都重新遍历目录 + 匹配
        let t_old = std::time::Instant::now();
        let walked = build_index(&dir);
        let old_hits = count_matches(&walked, &pq);
        let old_total = t_old.elapsed();
        assert_eq!(new_hits, old_hits, "新旧实现的命中数应一致");

        println!("[基准] 目录：{}", dir);
        println!("[基准] 索引条目：{} 条", entries.len());
        println!("[基准] 冷启动建索引：{:?}（from_cache={}）", cold, from_cache);
        println!(
            "[基准] 缓存命中取索引：{:?}/次（{} 次平均，全部命中={}）",
            hot_avg, rounds, hot_cache_hit
        );
        println!("[基准] 命中数：{} 条（新旧实现一致）", new_hits);
        println!("[基准] 改造前完整搜索：{:?}", old_total);
        println!("[基准] 改造后完整搜索：{:?}", new_total);
        println!(
            "[基准] 端到端加速：约 {}x",
            old_total.as_nanos() / new_total.as_nanos().max(1)
        );
    }

    /// 统计在给定条目集合上的命中数量
    fn count_matches(entries: &[FileEntry], pq: &ParsedQuery) -> usize {
        entries
            .par_iter()
            .filter(|e| {
                pq.and_groups
                    .iter()
                    .any(|g| g.iter().all(|t| term_matches(t, e)))
            })
            .count()
    }
}
