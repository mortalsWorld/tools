import type { LucideIcon } from 'lucide-react';
import {
  KeyRound, ShieldCheck, Shield, Lock, LockOpen, KeySquare, Vault,
  Globe, GlobeLock, Link, Mail, Send, MessageCircle, AtSign, Rss,
  CreditCard, Landmark, Wallet, PiggyBank, Banknote, Coins, Receipt, Calculator,
  Briefcase, Folder, FolderOpen, Archive, Calendar, ClipboardList, Presentation,
  Smartphone, Laptop, Monitor, Tv, Printer, HardDrive, Battery,
  Terminal, Code, GitBranch, Database, Server, Cloud, Wifi, Bot, Cpu, Container,
  House, Car, Bike, Plane, MapPin, Coffee, UtensilsCrossed, ShoppingCart,
  Gamepad2, AudioLines, Film, Camera, Headphones, Palette, Clapperboard, Trophy,
  BookOpen, FileText, Star, Flame, Heart,
  File, Image, Music, Sparkles, ThumbsUp, PartyPopper, Keyboard, PhoneCall, Search,
  Building, Store, Castle, Bus, Rocket, Pizza, Apple, Cherry, Leaf, TreePine,
  Bookmark, Newspaper, Scroll, Gift, Ticket, Target, Dices, Dumbbell,
  Cat, Dog, Rabbit, Panda, CircleCheck, Zap, Sun,
} from 'lucide-react';

/** 共享 Lucide 图标注册表（名称 → 组件），存储值为 `lucide:<名称>` */
export const LUCIDE_ICON_BY_NAME: Record<string, LucideIcon> = {
  // 安全/账户
  KeyRound, ShieldCheck, Shield, Lock, LockOpen, KeySquare, Vault,
  // 网站/社交
  Globe, GlobeLock, Link, Mail, Send, MessageCircle, AtSign, Rss,
  // 金融/支付
  CreditCard, Landmark, Wallet, PiggyBank, Banknote, Coins, Receipt, Calculator,
  // 工作/办公
  Briefcase, Folder, FolderOpen, Archive, Calendar, ClipboardList, Presentation,
  // 设备/硬件
  Smartphone, Laptop, Monitor, Tv, Printer, HardDrive, Battery, Keyboard, PhoneCall,
  // 开发/服务器
  Terminal, Code, GitBranch, Database, Server, Cloud, Wifi, Bot, Cpu, Container,
  // 生活
  House, Car, Bike, Plane, MapPin, Coffee, UtensilsCrossed, ShoppingCart,
  // 娱乐/文化
  Gamepad2, AudioLines, Film, Camera, Headphones, Palette, Clapperboard, Trophy,
  BookOpen, FileText, Star, Flame, Heart,
  // 文件/媒体补充
  File, Image, Music, Sparkles, ThumbsUp, PartyPopper, Search,
  Building, Store, Castle, Bus, Rocket, Pizza, Apple, Cherry, Leaf, TreePine,
  Bookmark, Newspaper, Scroll, Gift, Ticket, Target, Dices, Dumbbell,
  Cat, Dog, Rabbit, Panda, CircleCheck, Zap, Sun,
  // 视频别名
  Video: Clapperboard,
};

/** 默认图标值 */
export const DEFAULT_FILE_ICON = 'lucide:FileText';
export const DEFAULT_FOLDER_ICON = 'lucide:Folder';
export const DEFAULT_WEB_ICON = 'lucide:Globe';
export const DEFAULT_PASSWORD_ICON = 'lucide:KeyRound';

/**
 * 旧版 emoji 图标 → Lucide 矢量图标映射（存储值为 `lucide:<名称>`）。
 * 覆盖此前默认图标集及配置文件中常见的 emoji，未匹配的保留原 emoji 兼容显示。
 */
export const EMOJI_TO_LUCIDE: Record<string, string> = {
  // 安全/账户
  '🔑': 'lucide:KeyRound', '🔐': 'lucide:ShieldCheck', '🛡️': 'lucide:ShieldCheck',
  '🔒': 'lucide:Lock', '🔓': 'lucide:LockOpen', '🔏': 'lucide:Lock',
  // 网络/社交
  '🌐': 'lucide:Globe', '📧': 'lucide:Mail', '📞': 'lucide:PhoneCall', '☎️': 'lucide:PhoneCall',
  // 金融/办公
  '💳': 'lucide:CreditCard', '🏦': 'lucide:Landmark', '💼': 'lucide:Briefcase',
  '📊': 'lucide:Calculator', '📈': 'lucide:Calculator', '📉': 'lucide:Calculator',
  '📌': 'lucide:Bookmark', '🔖': 'lucide:Bookmark',
  // 文件/文档
  '📄': 'lucide:FileText', '📁': 'lucide:Folder', '📝': 'lucide:FileText',
  '📃': 'lucide:FileText', '📰': 'lucide:Newspaper', '📜': 'lucide:Scroll',
  '📔': 'lucide:BookOpen', '📕': 'lucide:BookOpen', '📖': 'lucide:BookOpen',
  '📗': 'lucide:BookOpen', '📘': 'lucide:BookOpen', '📙': 'lucide:BookOpen',
  '📚': 'lucide:BookOpen', '📓': 'lucide:BookOpen', '📒': 'lucide:BookOpen',
  // 媒体/娱乐
  '🎬': 'lucide:Clapperboard', '🎥': 'lucide:Video', '🎞️': 'lucide:Video',
  '📽️': 'lucide:Video', '📺': 'lucide:Tv', '📷': 'lucide:Camera', '📸': 'lucide:Camera',
  '🎵': 'lucide:Music', '🎶': 'lucide:Music', '🎼': 'lucide:Music',
  '🎸': 'lucide:Music', '🎹': 'lucide:Music', '🎺': 'lucide:Music', '🎻': 'lucide:Music', '🎤': 'lucide:Music',
  '🎨': 'lucide:Palette', '🎭': 'lucide:Palette', '🎪': 'lucide:PartyPopper',
  '🎮': 'lucide:Gamepad2', '🎯': 'lucide:Target', '🎲': 'lucide:Dices', '🎰': 'lucide:Dices',
  // 设备
  '📱': 'lucide:Smartphone', '📲': 'lucide:Smartphone', '💻': 'lucide:Laptop',
  '🖥️': 'lucide:Monitor', '🖨️': 'lucide:Printer', '⌨️': 'lucide:Keyboard',
  '🖱️': 'lucide:Monitor', '🖲️': 'lucide:Monitor', '💽': 'lucide:Monitor', '💾': 'lucide:Monitor',
  '💡': 'lucide:Zap', '🔦': 'lucide:Zap', '🏮': 'lucide:Zap',
  // 建筑/出行
  '🏠': 'lucide:House', '🏢': 'lucide:Building', '🏪': 'lucide:Store', '🏬': 'lucide:Store',
  '🏯': 'lucide:Castle', '🏰': 'lucide:Castle', '🗼': 'lucide:Landmark', '🏛': 'lucide:Landmark',
  '🚗': 'lucide:Car', '🚕': 'lucide:Car', '🚙': 'lucide:Car', '🚌': 'lucide:Bus',
  '🏎️': 'lucide:Car', '🚓': 'lucide:Car', '🚑': 'lucide:Car', '🚒': 'lucide:Car',
  '🚲': 'lucide:Bike', '🚀': 'lucide:Rocket', '✈️': 'lucide:Plane', '🚂': 'lucide:Plane',
  // 餐饮/自然
  '☕': 'lucide:Coffee', '🍵': 'lucide:Coffee', '🍕': 'lucide:Pizza', '🍔': 'lucide:UtensilsCrossed',
  '🍎': 'lucide:Apple', '🍊': 'lucide:Cherry', '🍇': 'lucide:Cherry', '🍓': 'lucide:Cherry',
  '🌸': 'lucide:Leaf', '🌺': 'lucide:Leaf', '🌻': 'lucide:Sun', '🌷': 'lucide:Leaf',
  '🌼': 'lucide:Leaf', '🌿': 'lucide:Leaf', '🌲': 'lucide:TreePine', '🌳': 'lucide:TreePine',
  // 标记/状态
  '⭐': 'lucide:Star', '🌟': 'lucide:Sparkles', '✨': 'lucide:Sparkles', '💫': 'lucide:Sparkles',
  '🔥': 'lucide:Flame', '💯': 'lucide:CircleCheck', '👍': 'lucide:ThumbsUp',
  '🎉': 'lucide:PartyPopper', '🎊': 'lucide:PartyPopper', '❤️': 'lucide:Heart',
  '🎁': 'lucide:Gift', '🎫': 'lucide:Ticket', '🏆': 'lucide:Trophy',
  // 运动
  '🎾': 'lucide:Trophy', '🏀': 'lucide:Trophy', '🏈': 'lucide:Trophy',
  '⚽': 'lucide:Dumbbell', '⚾': 'lucide:Dumbbell', '🎿': 'lucide:Dumbbell',
  '🏂': 'lucide:Dumbbell', '🏃': 'lucide:Dumbbell',
  // 动物/表情
  '🐱': 'lucide:Cat', '🐶': 'lucide:Dog', '🐰': 'lucide:Rabbit', '🦊': 'lucide:Cat',
  '🐻': 'lucide:Dog', '🐼': 'lucide:Panda', '🐨': 'lucide:Panda', '🦁': 'lucide:Cat',
  '😊': 'lucide:Heart', '😍': 'lucide:Heart', '🥰': 'lucide:Heart',
  '🤩': 'lucide:Star', '😎': 'lucide:Star', '🤓': 'lucide:Star', '🥳': 'lucide:PartyPopper', '😄': 'lucide:Heart',
  // 其他
  '🔍': 'lucide:Search', '🔎': 'lucide:Search', '📟': 'lucide:Monitor', '📠': 'lucide:Printer',
  '📳': 'lucide:Smartphone', '📴': 'lucide:Smartphone',
};

/**
 * 将条目中的旧版 emoji 图标自动迁移为 Lucide 图标（返回新数组）。
 * 已是 `lucide:` 前缀或有自定义图片的条目保持不变；未命中映射的保留 emoji。
 */
export function migrateEmojiIcons<T extends { icon?: string; iconData?: string }>(items: T[]): T[] {
  return items.map(item => {
    if (!item.icon || item.iconData) return item;
    const mapped = EMOJI_TO_LUCIDE[item.icon];
    return mapped ? { ...item, icon: mapped } : item;
  });
}
