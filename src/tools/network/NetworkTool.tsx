import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Descriptions, Button, message, Alert, Tag, Collapse } from 'antd';
import { ReloadOutlined, GlobalOutlined, EnvironmentOutlined, WifiOutlined, HomeOutlined } from '@ant-design/icons';
const { Panel } = Collapse;

interface IPInfo {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
  org?: string;
  timezone?: string;
}

interface LocalNetworkInfo {
  ipv4: string[];
  ipv6: string[];
}

export const NetworkTool: React.FC = () => {
  const [ipInfo, setIpInfo] = useState<IPInfo | null>(null);
  const [localNetworkInfo, setLocalNetworkInfo] = useState<LocalNetworkInfo>({ ipv4: [], ipv6: [] });
  const [loading, setLoading] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);  // 标记初始加载是否完成

  // 优化的 fetchIPInfo - 支持懒加载和系统代理
  const fetchIPInfo = async (isManualRefresh = false) => {
    // 如果是手动刷新或者还没有加载过，才显示 loading
    if (isManualRefresh || !initialLoadDone) {
      setLoading(true);
    }
    try {
      // 通过主进程发起HTTP请求，避免CORS限制
      // 使用系统代理配置，自动检测并使用系统设置的代理
      const response = await (window as any).electronAPI.httpRequest({
        url: 'https://ipinfo.io/json',
        method: 'GET',
        timeoutMs: 15000,
        useSystemProxy: true,  // 自动使用系统代理配置
      });

      if (response.status >= 200 && response.status < 300 && response.body) {
        try {
          const data = typeof response.body === 'string'
            ? JSON.parse(response.body)
            : response.body;
          setIpInfo(data);
          setInitialLoadDone(true);  // 标记初始加载完成
          if (isManualRefresh) {
            message.success('获取成功');
          }
        } catch (parseError) {
          console.error('解析响应失败:', parseError);
          if (isManualRefresh) {
            message.error('解析响应失败');
          }
        }
      } else {
        if (isManualRefresh) {
          message.error(`获取失败，状态码: ${response.status}`);
        }
      }
    } catch (error) {
      console.error('Failed to fetch IP info:', error);
      if (isManualRefresh) {
        message.error(`网络请求失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // 优化的本地网络信息获取 - 使用 requestIdleCallback 延迟执行
  const fetchLocalNetworkInfo = async () => {
    const localIPs: LocalNetworkInfo = { ipv4: [], ipv6: [] };
    
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      
      pc.createDataChannel('');
      
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      // 使用更短的超时时间
      await new Promise(resolve => setTimeout(resolve, 50));
      
      if (pc.localDescription && pc.localDescription.sdp) {
        const sdp = pc.localDescription.sdp;
        const ipRegex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g;
        const ipv6Regex = /([0-9a-fA-F]{1,4}:[0-9a-fA-F:]+)/g;
        
        let match;
        while ((match = ipRegex.exec(sdp)) !== null) {
          const ip = match[1];
          if (!isPublicIP(ip) && ip !== '0.0.0.0' && ip !== '127.0.0.1' && !localIPs.ipv4.includes(ip)) {
            localIPs.ipv4.push(ip);
          }
        }
        
        while ((match = ipv6Regex.exec(sdp)) !== null) {
          const ip = match[1];
          if (!ip.includes('.') && ip !== '::' && ip !== '::1' && !localIPs.ipv6.includes(ip)) {
            localIPs.ipv6.push(ip);
          }
        }
      }
      
      pc.close();
    } catch (error) {
      console.error('获取本地网络信息失败:', error);
    }
    
    setLocalNetworkInfo(localIPs);
  };

  const isPublicIP = (ip: string): boolean => {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return false;
    
    if (parts[0] === 10) return false;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
    if (parts[0] === 192 && parts[1] === 168) return false;
    if (parts[0] === 127) return false;
    if (parts[0] === 0) return false;
    
    return true;
  };

  const isPrivateIP = (ip: string): boolean => {
    return !isPublicIP(ip);
  };

  // 优化：先加载本地网络信息（快速），然后异步加载公网信息
  useEffect(() => {
    // 先立即获取本地网络信息
    fetchLocalNetworkInfo();
    
    // 使用 requestIdleCallback 延迟加载公网信息，不阻塞主线程
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        fetchIPInfo(false);
      }, { timeout: 2000 });
    } else {
      // 降级处理：使用 setTimeout 延迟 100ms
      setTimeout(() => {
        fetchIPInfo(false);
      }, 100);
    }
  }, []);

  const handleRefresh = () => {
    fetchIPInfo(true);
    fetchLocalNetworkInfo();
  };

  return (
    <div style={{ padding: '16px' }}>
      <Card
        title="网络信息"
        extra={
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={loading}
          >
            刷新
          </Button>
        }
      >
        {/* 优化：本地网络信息始终显示，公网信息单独处理加载状态 */}
        {ipInfo ? (
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Descriptions title="公网基本信息" bordered column={1}>
                <Descriptions.Item label="公网 IP 地址">
                  <GlobalOutlined style={{ marginRight: '8px' }} />
                  {ipInfo.ip}
                </Descriptions.Item>
                <Descriptions.Item label="城市">
                  <EnvironmentOutlined style={{ marginRight: '8px' }} />
                  {ipInfo.city}
                </Descriptions.Item>
                <Descriptions.Item label="地区">
                  <EnvironmentOutlined style={{ marginRight: '8px' }} />
                  {ipInfo.region}
                </Descriptions.Item>
                <Descriptions.Item label="国家">
                  <EnvironmentOutlined style={{ marginRight: '8px' }} />
                  {ipInfo.country}
                </Descriptions.Item>
              </Descriptions>
            </Col>
            <Col xs={24} md={12}>
              <Descriptions title="公网详细信息" bordered column={1}>
                <Descriptions.Item label="经纬度">
                  <EnvironmentOutlined style={{ marginRight: '8px' }} />
                  {ipInfo.loc}
                </Descriptions.Item>
                <Descriptions.Item label="网络运营商">
                  <WifiOutlined style={{ marginRight: '8px' }} />
                  {ipInfo.org}
                </Descriptions.Item>
                <Descriptions.Item label="时区">
                  <EnvironmentOutlined style={{ marginRight: '8px' }} />
                  {ipInfo.timezone}
                </Descriptions.Item>
              </Descriptions>
            </Col>
          </Row>
        ) : (
          <Alert message="正在获取公网IP信息..." type="info" showIcon />
        )}
      </Card>

      <Card 
        title={
          <span>
            <HomeOutlined style={{ marginRight: '8px' }} />
            本地网络信息（内网IP）
          </span>
        }
        style={{ marginTop: '16px' }}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <div style={{ wordBreak: 'break-all' }}>
              <h4 style={{ marginBottom: '12px', fontWeight: 500 }}>IPv4 地址</h4>
              <div style={{ border: '1px solid #e8e8e8', borderRadius: '6px', padding: '12px' }}>
                {localNetworkInfo.ipv4.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {localNetworkInfo.ipv4.map((ip, index) => (
                      <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#666', fontSize: '13px', minWidth: '80px' }}>内网 IP {index + 1}:</span>
                        <Tag color="blue">{ip}</Tag>
                        {isPrivateIP(ip) && <Tag color="green">私有IP</Tag>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Alert message="未能检测到内网IPv4地址" type="info" showIcon style={{ marginBottom: 0 }} />
                )}
              </div>
            </div>
          </Col>
          <Col xs={24} md={12}>
            <div style={{ wordBreak: 'break-all' }}>
              <h4 style={{ marginBottom: '12px', fontWeight: 500 }}>IPv6 地址</h4>
              <div style={{ border: '1px solid #e8e8e8', borderRadius: '6px', padding: '12px' }}>
                {localNetworkInfo.ipv6.length > 0 ? (
                  <Collapse 
                    defaultActiveKey={localNetworkInfo.ipv6.length <= 3 ? ['ipv6-panel'] : []}
                    ghost
                    style={{ background: 'transparent', border: 'none' }}
                  >
                    <Panel 
                      header={`显示 ${localNetworkInfo.ipv6.length} 个 IPv6 地址`} 
                      key="ipv6-panel"
                      style={{ border: 'none' }}
                      extra={localNetworkInfo.ipv6.length > 3 ? null : undefined}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', wordBreak: 'break-all' }}>
                        {localNetworkInfo.ipv6.map((ip, index) => (
                          <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '4px', wordBreak: 'break-all' }}>
                            <span style={{ color: '#666', fontSize: '13px' }}>IPv6 {index + 1}:</span>
                            <code style={{ 
                              wordBreak: 'break-all', 
                              padding: '4px 8px', 
                              background: '#f5f5f5', 
                              borderRadius: '4px', 
                              fontSize: '12px',
                              display: 'block'
                            }}>{ip}</code>
                          </div>
                        ))}
                      </div>
                    </Panel>
                  </Collapse>
                ) : (
                  <Alert message="未能检测到IPv6地址" type="info" showIcon style={{ marginBottom: 0 }} />
                )}
              </div>
            </div>
          </Col>
        </Row>
      </Card>
    </div>
  );
};