// api/proxy.js
export default async function handler(req, res) {
  // 1. 设置跨域请求头（允许所有来源请求）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  // 2. 处理浏览器的预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3. 你的真实 Supabase 地址
  const targetUrl = `https://djihtebfuaqjenkrmvfih.supabase.co${req.url}`;
  
  try {
    // 4. 把请求转发给 Supabase
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        ...req.headers,
        host: 'djihtebfuaqjenkrmvfih.supabase.co'
      },
      // Vercel 默认解析了 req.body，需要转回字符串发出去
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
    });

    // 5. 把 Supabase 的响应原样返回给前端
    const data = await response.text();
    
    // 移除一些可能导致跨域问题的响应头，让 Vercel 自动处理
    res.removeHeader('content-encoding');
    res.removeHeader('content-length');
    res.removeHeader('transfer-encoding');
    
    res.status(response.status).send(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
