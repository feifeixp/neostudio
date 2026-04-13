# AI图片生成接口文档

## 1. 根据场景获取图片模型配置

### 接口信息
- **接口路径**: `https://dev.neodomain.cn/agent/ai-image-generation/models/by-scenario`
- **请求方式**: `GET`
- **接口描述**: 根据场景类型获取可用的图片生成模型列表,包含会员权限信息

### 请求参数

#### Headers
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| accessToken | String | 是 | 用户访问令牌 | `eyJhbGciOiJIUzUxMiJ9...` |

#### Query Parameters
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| scenarioType | Integer | 是 | 场景类型:<br>1-图片工具<br>2-画布<br>3-重绘<br>4-设计<br>5-分镜 | `1` |
| userId | String | 否 | 用户ID,用于会员优先模型排序 | `1234567890` |

### 请求示例
```bash
curl -X GET "https://dev.neodomain.cn/agent/ai-image-generation/models/by-scenario?scenarioType=1&userId=1234567890" \
  -H "accessToken: eyJhbGciOiJIUzUxMiJ9..."
```

### 响应参数

#### 成功响应
```json
{
  "success": true,
  "data": [
    {
      "model_id": 1,
      "model_name": "doubao-seedream-4-0",
      "model_display_name": "豆包AI绘画4.0",
      "model_description": "豆包最新一代AI绘画模型,支持高质量图片生成",
      "provider": "doubao",
      "model_type": "text-to-image",
      "display_type": 3,
      "is_default_design_model": true,
      "is_default_shot_model": false,
      "support_seed": true,
      "support_custom_aspect_ratio": true,
      "max_reference_images": 5,
      "image_count_options": ["1", "4"],
      "points_cost_per_image": 10,
      "size_pricing_config": "{\"1K\": 10, \"2K\": 15, \"4K\": 30}",
      "supported_output_formats": ["jpeg", "png", "webp"],
      "supported_aspect_ratios": ["1:1", "16:9", "9:16", "4:3", "3:4"],
      "supported_sizes": ["1K", "2K", "4K"],
      "require_membership": false,
      "min_membership_level": 0,
      "max_membership_level": 999
    }
  ],
  "errCode": null,
  "errMessage": null
}
```

### 响应字段说明

| 字段名 | 类型 | 说明 |
|--------|------|------|
| model_id | Long | 模型ID |
| model_name | String | 模型名称(用于调用生成接口) |
| model_display_name | String | 模型显示名称 |
| model_description | String | 模型描述 |
| provider | String | 提供商 |
| model_type | String | 模型类型 |
| display_type | Integer | 显示类型:1-仅图片工具,2-仅画布,3-都显示,4-都不显示 |
| is_default_design_model | Boolean | 是否为默认设计图片模型 |
| is_default_shot_model | Boolean | 是否为默认分镜图片模型 |
| support_seed | Boolean | 是否支持随机种子 |
| support_custom_aspect_ratio | Boolean | 是否支持自定义宽高比 |
| max_reference_images | Integer | 参考图最大数量 |
| image_count_options | List\<String\> | 生成图数量可选项 |
| points_cost_per_image | Integer | 单张图片消耗积分 |
| size_pricing_config | String | 尺寸定价配置(JSON格式) |
| supported_output_formats | List\<String\> | 支持的输出格式 |
| supported_aspect_ratios | List\<String\> | 支持的宽高比 |
| supported_sizes | List\<String\> | 支持的尺寸规格 |
| require_membership | Boolean | 是否需要会员 |
| min_membership_level | Integer | 最低会员等级:0-无要求,1-普通会员,2-高级会员,3-VIP会员 |
| max_membership_level | Integer | 最高会员等级限制:999表示无上限 |

---

## 2. 提交图片生成请求

### 接口信息
- **接口路径**: `https://dev.neodomain.cn/agent/ai-image-generation/generate`
- **请求方式**: `POST`
- **接口描述**: 根据提示词和可选的参考图片生成新图片

### 请求参数

#### Headers
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| accessToken | String | 是 | 用户访问令牌 | `eyJhbGciOiJIUzUxMiJ9...` |

#### Body (JSON)
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| prompt | String | 是 | 提示词 | `A beautiful landscape with mountains and lakes` |
| negativePrompt | String | 否 | 负面提示词 | `blurry, low quality, watermark` |
| modelName | String | 是 | 模型名称 | `doubao-seedream-4-0` |
| imageUrls | List\<String\> | 否 | 参考图片URL列表 | `["https://example.com/image1.jpg"]` |
| aspectRatio | String | 否 | 图片宽高比 | `16:9` |
| numImages | String | 是 | 生成图片数量 | `1` 或 `4` |
| outputFormat | String | 否 | 输出格式,默认jpeg | `jpeg` |
| syncMode | Boolean | 否 | 同步模式,默认false | `false` |
| safetyTolerance | String | 否 | 安全容忍度(1-6),默认5 | `5` |
| guidanceScale | Double | 否 | 引导比例(1.0-20.0),默认7.5 | `7.5` |
| seed | Integer | 否 | 随机种子 | `42` |
| size | String | 否 | 图片尺寸,默认2K | `2K` |
| sourceType | String | 否 | 数据来源类型,默认USER_DIRECT | `USER_DIRECT` |
| showPrompt | Boolean | 否 | 是否显示提示词,默认true | `true` |

#### 请求示例
```json
{
  "prompt": "A beautiful landscape with mountains and lakes, sunset, realistic style",
  "negativePrompt": "blurry, low quality, watermark, signature",
  "modelName": "doubao-seedream-4-0",
  "imageUrls": [],
  "aspectRatio": "16:9",
  "numImages": "1",
  "outputFormat": "jpeg",
  "syncMode": false,
  "safetyTolerance": "5",
  "guidanceScale": 7.5,
  "size": "2K",
  "showPrompt": true
}
```

### 响应参数

#### 成功响应
```json
{
  "success": true,
  "data": {
    "task_code": "IMG_GEN_20241201_001",
    "status": "PENDING",
    "image_urls": null,
    "failure_reason": null,
    "create_time": "2024-12-01 10:30:00"
  },
  "errCode": null,
  "errMessage": null
}
```

#### 失败响应
```json
{
  "success": false,
  "data": null,
  "errCode": "INSUFFICIENT_POINTS",
  "errMessage": "积分不足"
}
```

### 响应字段说明

| 字段名 | 类型 | 说明 |
|--------|------|------|
| task_code | String | 任务编码,用于查询生成结果 |
| status | String | 任务状态:PENDING-处理中,SUCCESS-成功,FAILED-失败 |
| image_urls | List\<String\> | 生成的图片URL列表(处理中时为null) |
| failure_reason | String | 失败原因 |
| create_time | String | 创建时间 |

---

## 3. 查询图片生成结果

### 接口信息
- **接口路径**: `https://dev.neodomain.cn/agent/ai-image-generation/result/{taskCode}`
- **请求方式**: `GET`
- **接口描述**: 根据任务编码查询图片生成的状态和结果

### 请求参数

#### Headers
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| accessToken | String | 是 | 用户访问令牌 | `eyJhbGciOiJIUzUxMiJ9...` |

#### Path Parameters
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| taskCode | String | 是 | 任务编码 | `IMG_GEN_20241201_001` |

### 请求示例
```bash
curl -X GET "https://dev.neodomain.cn/agent/ai-image-generation/result/IMG_GEN_20241201_001" \
  -H "accessToken: eyJhbGciOiJIUzUxMiJ9..."
```

### 响应参数

#### 成功响应 - 处理中
```json
{
  "success": true,
  "data": {
    "task_code": "IMG_GEN_20241201_001",
    "status": "PENDING",
    "image_urls": null,
    "failure_reason": null,
    "create_time": "2024-12-01 10:30:00"
  },
  "errCode": null,
  "errMessage": null
}
```

#### 成功响应 - 已完成
```json
{
  "success": true,
  "data": {
    "task_code": "IMG_GEN_20241201_001",
    "status": "SUCCESS",
    "image_urls": [
      "https://wlpaas.oss-cn-shanghai.aliyuncs.com/images/20241201/image1.jpg",
      "https://wlpaas.oss-cn-shanghai.aliyuncs.com/images/20241201/image2.jpg"
    ],
    "failure_reason": null,
    "create_time": "2024-12-01 10:30:00"
  },
  "errCode": null,
  "errMessage": null
}
```

#### 失败响应
```json
{
  "success": true,
  "data": {
    "task_code": "IMG_GEN_20241201_001",
    "status": "FAILED",
    "image_urls": null,
    "failure_reason": "内容违规,请修改提示词后重试",
    "create_time": "2024-12-01 10:30:00"
  },
  "errCode": null,
  "errMessage": null
}
```

### 响应字段说明

| 字段名 | 类型 | 说明 |
|--------|------|------|
| task_code | String | 任务编码 |
| status | String | 任务状态:PENDING-处理中,SUCCESS-成功,FAILED-失败 |
| image_urls | List\<String\> | 生成的图片URL列表 |
| failure_reason | String | 失败原因 |
| create_time | String | 创建时间 |

---

## 通用说明

### 任务状态说明
| 状态 | 说明 | 处理建议 |
|------|------|----------|
| PENDING | 任务处理中 | 继续轮询查询结果 |
| SUCCESS | 任务成功完成 | 获取image_urls中的图片 |
| FAILED | 任务失败 | 查看failure_reason,修改参数后重试 |

### 错误码说明
| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| UNAUTHORIZED | 访问令牌无效或已过期 | 重新登录获取新的accessToken |
| INSUFFICIENT_POINTS | 积分不足 | 充值积分或降低生成数量/尺寸 |
| INVALID_MODEL | 模型不存在或未启用 | 使用getModelsByScenario接口获取可用模型 |
| INVALID_PARAMS | 参数错误 | 检查参数格式和取值范围 |
| CONTENT_VIOLATION | 内容违规 | 修改提示词,避免敏感内容 |
| MEMBERSHIP_REQUIRED | 需要会员权限 | 升级会员等级 |

### 使用流程

1. **获取可用模型**
   ```
   调用 getModelsByScenario 接口获取场景下可用的模型列表
   ```

2. **提交生成请求**
   ```
   选择合适的模型,调用 generateImage 接口提交生成请求
   获取返回的 task_code
   ```

3. **轮询查询结果**
   ```
   使用 task_code 调用 getGenerationResult 接口查询结果
   建议每3-5秒轮询一次,直到状态变为 SUCCESS 或 FAILED
   ```

4. **获取图片**
   ```
   状态为 SUCCESS 时,从 image_urls 中获取生成的图片URL
   ```

### 参数配置建议

#### 宽高比选择
- **1:1** - 适合头像、图标、社交媒体
- **16:9** - 适合横屏展示、视频封面
- **9:16** - 适合竖屏展示、手机壁纸
- **4:3** - 适合传统照片、演示文稿
- **21:9** - 适合超宽屏、电影画面

#### 尺寸选择
- **1K** - 快速预览,积分消耗少
- **2K** - 平衡质量和速度,推荐日常使用
- **4K** - 高清输出,适合打印和专业用途

#### 引导比例(guidanceScale)
- **1.0-5.0** - 更自由的创作,可能偏离提示词
- **7.5** - 推荐值,平衡创意和准确性
- **10.0-20.0** - 严格遵循提示词,但可能缺乏创意

### 注意事项

1. **积分消耗**
   - 不同模型和尺寸消耗的积分不同
   - 生成前请确保积分充足
   - 可通过size_pricing_config查看具体定价

2. **轮询频率**
   - 建议3-5秒轮询一次
   - 避免过于频繁的请求
   - 一般图片生成需要10-60秒

3. **参考图片**
   - 参考图片需要是可访问的URL
   - 注意max_reference_images限制
   - 不同模型对参考图的支持程度不同

4. **提示词优化**
   - 使用详细、具体的描述
   - 合理使用负面提示词排除不需要的元素
   - 避免敏感、违规内容

5. **会员权限**
   - 某些高级模型需要会员权限
   - 通过require_membership和min_membership_level判断
   - 非会员用户请选择无会员要求的模型
