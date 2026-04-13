# OSS STS令牌接口文档

## 接口信息
- **接口路径**: `https://story.neodomain.cn/agent/sts/oss/token`
- **请求方式**: `GET`
- **接口描述**: 获取阿里云OSS的临时访问凭证(STS Token),用于客户端直传文件到OSS

## 请求参数

### Headers
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| accessToken | String | 是 | 用户访问令牌 | `eyJhbGciOiJIUzUxMiJ9...` |

### Query Parameters
无

### Body
无

### 请求示例
```bash
curl -X GET "https://story.neodomain.cn/agent/sts/oss/token" \
  -H "accessToken: eyJhbGciOiJIUzUxMiJ9..."
```

## 响应参数

### 成功响应
```json
{
  "success": true,
  "data": {
    "accessKeyId": "STS.NUxxxxxxxxxxxxxxxxxxxx",
    "accessKeySecret": "7Fxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "securityToken": "CAISxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "expiration": "3600",
    "requestId": "8C4E7B8A-7F2D-4E9B-8A3C-1234567890AB",
    "bucketName": "wlpaas",
    "env": "prod"
  },
  "errCode": null,
  "errMessage": null
}
```

### 失败响应
```json
{
  "success": false,
  "data": null,
  "errCode": "UNAUTHORIZED",
  "errMessage": "访问令牌无效或已过期"
}
```

## 响应字段说明

| 字段名 | 类型 | 说明 |
|--------|------|------|
| accessKeyId | String | 临时访问密钥ID,用于OSS SDK初始化 |
| accessKeySecret | String | 临时访问密钥Secret,用于OSS SDK初始化 |
| securityToken | String | 安全令牌,用于OSS SDK初始化 |
| expiration | String | 令牌过期时间(秒),默认3600秒(1小时) |
| requestId | String | 阿里云STS服务返回的请求ID |
| bucketName | String | OSS存储桶名称 |
| env | String | 当前环境标识(dev/test/prod) |

## 使用说明

### 1. 令牌有效期
- 默认有效期为 **3600秒(1小时)**
- 建议在令牌过期前重新获取新令牌

### 2. 权限范围
当前STS令牌仅授予以下权限:
- **操作**: `oss:PutObject` (上传文件)
- **资源**: `acs:oss:*:*:wlpaas/*` (wlpaas存储桶下所有对象)

### 3. 客户端使用示例

#### JavaScript (使用ali-oss SDK)
```javascript
const OSS = require('ali-oss');

// 1. 获取STS令牌
const response = await fetch('https://story.neodomain.cn/agent/sts/oss/token', {
  headers: {
    'accessToken': 'your-access-token'
  }
});
const { data } = await response.json();

// 2. 初始化OSS客户端
const client = new OSS({
  region: 'oss-cn-shanghai',
  accessKeyId: data.accessKeyId,
  accessKeySecret: data.accessKeySecret,
  stsToken: data.securityToken,
  bucket: data.bucketName
});

// 3. 上传文件
const result = await client.put('path/to/file.jpg', file);
console.log('上传成功:', result.url);
```

#### Python (使用oss2 SDK)
```python
import oss2
import requests

# 1. 获取STS令牌
response = requests.get(
    'https://story.neodomain.cn/agent/sts/oss/token',
    headers={'accessToken': 'your-access-token'}
)
data = response.json()['data']

# 2. 初始化OSS客户端
auth = oss2.StsAuth(
    data['accessKeyId'],
    data['accessKeySecret'],
    data['securityToken']
)
bucket = oss2.Bucket(auth, 'oss-cn-shanghai.aliyuncs.com', data['bucketName'])

# 3. 上传文件
result = bucket.put_object('path/to/file.jpg', open('local_file.jpg', 'rb'))
print(f'上传成功: {result.status}')
```

## 错误码说明

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| UNAUTHORIZED | 访问令牌无效或已过期 | 重新登录获取新的accessToken |
| FORBIDDEN | 无权限访问该接口 | 检查用户权限配置 |
| INTERNAL_ERROR | 服务器内部错误 | 联系技术支持 |

## 注意事项

1. **安全性**: 
   - 请勿在客户端代码中硬编码accessToken
   - STS令牌具有时效性,过期后需重新获取
   - 不要将STS凭证暴露在公开的代码仓库中

2. **性能优化**:
   - 建议在令牌过期前5分钟提前刷新
   - 可以在客户端缓存令牌,避免频繁请求

3. **跨域问题**:
   - 如果前端域名与API域名不同,需要配置CORS
   - 确保后端已添加前端域名到CORS白名单

4. **文件上传路径**:
   - 建议使用有意义的路径结构,如: `{userId}/{date}/{filename}`
   - 避免文件名冲突,可添加时间戳或UUID
