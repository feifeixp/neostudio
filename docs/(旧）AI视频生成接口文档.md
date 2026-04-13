# AI视频生成接口文档

## 1. 获取可用的视频模型级联列表

### 接口信息
- **接口路径**: `https://dev.neodomain.cn/agent/user/video/models/cascading`
- **请求方式**: `GET`
- **接口描述**: 获取支持级联选择的视频模型配置信息,包含模型、生成类型、分辨率、时长、宽高比的完整配置链

### 请求参数

#### Headers
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| accessToken | String | 是 | 用户访问令牌 | `eyJhbGciOiJIUzUxMiJ9...` |

#### Query Parameters
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| requestType | Integer | 否 | 请求类型:<br>1-视频工具<br>2-画布<br>默认为2 | `2` |

### 请求示例
```bash
curl -X GET "https://dev.neodomain.cn/agent/user/video/models/cascading?requestType=2" \
  -H "accessToken: eyJhbGciOiJIUzUxMiJ9..."
```

### 响应参数

#### 成功响应
```json
{
  "success": true,
  "data": [
    {
      "value": "veo3",
      "name": "Veo 3",
      "description": "Google最新视频生成模型,支持高质量视频生成",
      "tags": ["高质量", "多功能", "推荐"],
      "provider": "FAL",
      "supportAudio": true,
      "supportEnhance": true,
      "supportFirstLastFrame": true,
      "supportReferenceToVideo": true,
      "supportReferenceToVideoSize": 10,
      "generationTypes": [
        {
          "value": "TEXT_TO_VIDEO",
          "name": "文生视频",
          "resolutions": [
            {
              "value": "720p",
              "name": "720P",
              "durations": [
                {
                  "value": "8s",
                  "name": "8秒",
                  "aspectRatios": [
                    {
                      "value": "16:9",
                      "name": "横屏 16:9",
                      "basePoints": 100,
                      "audioPoints": 20,
                      "enhancePoints": 10
                    },
                    {
                      "value": "9:16",
                      "name": "竖屏 9:16",
                      "basePoints": 100,
                      "audioPoints": 20,
                      "enhancePoints": 10
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "value": "IMAGE_TO_VIDEO",
          "name": "图生视频",
          "resolutions": [...]
        }
      ]
    }
  ],
  "errCode": null,
  "errMessage": null
}
```

### 响应字段说明

#### 模型级别字段
| 字段名 | 类型 | 说明 |
|--------|------|------|
| value | String | 模型名称(用于调用生成接口) |
| name | String | 模型显示名称 |
| description | String | 模型描述 |
| tags | List\<String\> | 模型标签列表 |
| provider | String | 提供商 |
| supportAudio | Boolean | 是否支持音频生成 |
| supportEnhance | Boolean | 是否支持提示词增强 |
| supportFirstLastFrame | Boolean | 是否支持首尾帧生成视频 |
| supportReferenceToVideo | Boolean | 是否支持多图参考生成视频 |
| supportReferenceToVideoSize | Integer | 多图参考最大数量(0表示不支持) |
| generationTypes | List | 生成类型配置列表 |

#### 生成类型配置字段
| 字段名 | 类型 | 说明 |
|--------|------|------|
| value | String | 生成类型值(TEXT_TO_VIDEO/IMAGE_TO_VIDEO/REFERENCE_TO_VIDEO) |
| name | String | 生成类型显示名称 |
| resolutions | List | 分辨率配置列表 |

#### 分辨率配置字段
| 字段名 | 类型 | 说明 |
|--------|------|------|
| value | String | 分辨率值(720p/768p/1080p) |
| name | String | 分辨率显示名称 |
| durations | List | 时长配置列表 |

#### 时长配置字段
| 字段名 | 类型 | 说明 |
|--------|------|------|
| value | String | 时长值(4s/5s/6s/8s/10s/16s) |
| name | String | 时长显示名称 |
| aspectRatios | List | 宽高比配置列表 |

#### 宽高比配置字段
| 字段名 | 类型 | 说明 |
|--------|------|------|
| value | String | 宽高比值(16:9/9:16/1:1) |
| name | String | 宽高比显示名称 |
| basePoints | Integer | 基础积分消耗 |
| audioPoints | Integer | 音频生成额外积分 |
| enhancePoints | Integer | 提示词增强额外积分 |

---

## 2. 提交视频生成任务

### 接口信息
- **接口路径**: `https://dev.neodomain.cn/agent/user/video/generate`
- **请求方式**: `POST`
- **接口描述**: 提交视频生成任务,支持文生视频、图生视频和多图参考生成视频

### 请求参数

#### Headers
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| accessToken | String | 是 | 用户访问令牌 | `eyJhbGciOiJIUzUxMiJ9...` |

#### Body (JSON)
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| modelName | String | 是 | 模型名称 | `veo3` |
| generationType | String | 是 | 生成类型 | `TEXT_TO_VIDEO` |
| prompt | String | 是 | 提示词(最长2000字符) | `A beautiful sunset over the ocean` |
| negativePrompt | String | 否 | 负面提示词(最长1000字符) | `low quality, blurry` |
| firstFrameImageUrl | String | 条件必填 | 首帧图片URL(图生视频时必填) | `https://example.com/first.jpg` |
| lastFrameImageUrl | String | 否 | 尾帧图片URL(部分模型支持) | `https://example.com/last.jpg` |
| imageUrls | List\<String\> | 条件必填 | 参考图片URL列表(多图参考时必填) | `["https://example.com/ref1.jpg"]` |
| aspectRatio | String | 否 | 视频宽高比 | `16:9` |
| resolution | String | 否 | 视频分辨率 | `720p` |
| duration | String | 否 | 视频时长 | `8s` |
| fps | Integer | 否 | 帧率,默认24 | `24` |
| seed | Integer | 否 | 随机种子(0-2147483647) | `12345` |
| generateAudio | Boolean | 否 | 是否生成音频,默认false | `true` |
| enhancePrompt | Boolean | 否 | 是否启用提示词增强,默认false | `true` |
| promptOptimizer | Boolean | 否 | 是否使用提示词优化器,默认false | `false` |
| shotId | Long | 否 | 分镜ID | `1` |
| sourceType | String | 否 | 数据来源类型 | `USER_DIRECT` |

#### 请求示例 - 文生视频
```json
{
  "modelName": "veo3",
  "generationType": "TEXT_TO_VIDEO",
  "prompt": "A beautiful sunset over the ocean with gentle waves, cinematic lighting, 4k quality",
  "negativePrompt": "low quality, blurry, distorted",
  "aspectRatio": "16:9",
  "resolution": "720p",
  "duration": "8s",
  "fps": 24,
  "generateAudio": true,
  "enhancePrompt": true
}
```

#### 请求示例 - 图生视频
```json
{
  "modelName": "veo3",
  "generationType": "IMAGE_TO_VIDEO",
  "prompt": "The camera slowly zooms in on the mountain peak",
  "firstFrameImageUrl": "https://example.com/mountain.jpg",
  "aspectRatio": "16:9",
  "resolution": "720p",
  "duration": "8s",
  "generateAudio": false
}
```

#### 请求示例 - 多图参考生成视频
```json
{
  "modelName": "veo3",
  "generationType": "REFERENCE_TO_VIDEO",
  "prompt": "A smooth transition between these scenes",
  "imageUrls": [
    "https://example.com/scene1.jpg",
    "https://example.com/scene2.jpg",
    "https://example.com/scene3.jpg"
  ],
  "aspectRatio": "16:9",
  "resolution": "720p",
  "duration": "8s"
}
```

### 响应参数

#### 成功响应
```json
{
  "success": true,
  "data": {
    "id": 12345,
    "generationRecordId": "VID_GEN_20241201_001",
    "modelName": "veo3",
    "modelProvider": "FAL",
    "generationType": "TEXT_TO_VIDEO",
    "prompt": "A beautiful sunset over the ocean with gentle waves",
    "aspectRatio": "16:9",
    "resolution": "720p",
    "duration": 8,
    "fps": 24,
    "status": "PENDING",
    "statusDesc": "任务已提交,等待处理",
    "startTime": "2024-12-01T10:30:00"
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
  "errMessage": "积分不足,当前积分: 50, 需要积分: 100"
}
```

### 响应字段说明

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | Long | 记录ID |
| generationRecordId | String | 生成记录ID,用于查询状态 |
| modelName | String | 模型名称 |
| modelProvider | String | 模型提供商 |
| generationType | String | 生成类型 |
| prompt | String | 提示词 |
| negativePrompt | String | 负面提示词 |
| firstFrameImageUrl | String | 首帧图片URL |
| lastFrameImageUrl | String | 尾帧图片URL |
| aspectRatio | String | 视频宽高比 |
| resolution | String | 视频分辨率 |
| duration | Integer | 视频时长(秒) |
| fps | Integer | 帧率 |
| seed | Integer | 随机种子 |
| status | String | 任务状态:PENDING-待处理,PROCESSING-处理中,SUCCESS-成功,FAILED-失败 |
| statusDesc | String | 状态描述 |
| ossVideoUrl | String | OSS视频URL(成功后返回) |
| thumbnailUrl | String | 缩略图URL(成功后返回) |
| videoDurationSeconds | BigDecimal | 实际视频时长(秒) |
| errorMessage | String | 错误信息 |
| errorCode | String | 错误代码 |
| startTime | Date | 开始处理时间 |
| completeTime | Date | 完成时间 |

---

## 3. 查询视频生成状态

### 接口信息
- **接口路径**: `https://dev.neodomain.cn/agent/user/video/status/{generationRecordId}`
- **请求方式**: `GET`
- **接口描述**: 根据生成记录ID查询视频生成任务的状态和结果

### 请求参数

#### Headers
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| accessToken | String | 是 | 用户访问令牌 | `eyJhbGciOiJIUzUxMiJ9...` |

#### Path Parameters
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| generationRecordId | String | 是 | 生成记录ID | `VID_GEN_20241201_001` |

### 请求示例
```bash
curl -X GET "https://dev.neodomain.cn/agent/user/video/status/VID_GEN_20241201_001" \
  -H "accessToken: eyJhbGciOiJIUzUxMiJ9..."
```

### 响应参数

#### 成功响应 - 处理中
```json
{
  "success": true,
  "data": {
    "id": 12345,
    "generationRecordId": "VID_GEN_20241201_001",
    "modelName": "veo3",
    "modelProvider": "FAL",
    "generationType": "TEXT_TO_VIDEO",
    "prompt": "A beautiful sunset over the ocean with gentle waves",
    "aspectRatio": "16:9",
    "resolution": "720p",
    "duration": 8,
    "fps": 24,
    "status": "PROCESSING",
    "statusDesc": "视频生成中,预计还需2分钟",
    "startTime": "2024-12-01T10:30:00"
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
    "id": 12345,
    "generationRecordId": "VID_GEN_20241201_001",
    "modelName": "veo3",
    "modelProvider": "FAL",
    "generationType": "TEXT_TO_VIDEO",
    "prompt": "A beautiful sunset over the ocean with gentle waves",
    "aspectRatio": "16:9",
    "resolution": "720p",
    "duration": 8,
    "fps": 24,
    "status": "SUCCESS",
    "statusDesc": "视频生成成功",
    "ossVideoUrl": "https://wlpaas.oss-cn-shanghai.aliyuncs.com/videos/20241201/video.mp4",
    "thumbnailUrl": "https://wlpaas.oss-cn-shanghai.aliyuncs.com/videos/20241201/thumbnail.jpg",
    "videoDurationSeconds": 8.5,
    "startTime": "2024-12-01T10:30:00",
    "completeTime": "2024-12-01T10:32:30"
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
    "id": 12345,
    "generationRecordId": "VID_GEN_20241201_001",
    "modelName": "veo3",
    "status": "FAILED",
    "statusDesc": "视频生成失败",
    "errorMessage": "内容违规,请修改提示词后重试",
    "errorCode": "CONTENT_VIOLATION",
    "startTime": "2024-12-01T10:30:00",
    "completeTime": "2024-12-01T10:31:00"
  },
  "errCode": null,
  "errMessage": null
}
```

---

## 通用说明

### 任务状态说明
| 状态 | 说明 | 处理建议 |
|------|------|----------|
| PENDING | 任务已提交,等待处理 | 继续轮询查询状态 |
| PROCESSING | 任务处理中 | 继续轮询查询状态 |
| SUCCESS | 任务成功完成 | 获取ossVideoUrl中的视频 |
| FAILED | 任务失败 | 查看errorMessage,修改参数后重试 |

### 生成类型说明
| 类型 | 说明 | 必需参数 |
|------|------|----------|
| TEXT_TO_VIDEO | 文生视频 | prompt |
| IMAGE_TO_VIDEO | 图生视频 | prompt + firstFrameImageUrl |
| REFERENCE_TO_VIDEO | 多图参考生成视频 | prompt + imageUrls |

### 错误码说明
| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| UNAUTHORIZED | 访问令牌无效或已过期 | 重新登录获取新的accessToken |
| INSUFFICIENT_POINTS | 积分不足 | 充值积分或降低视频参数 |
| INVALID_MODEL | 模型不存在或未启用 | 使用getCascadingVideoModels接口获取可用模型 |
| INVALID_PARAMS | 参数错误 | 检查参数格式和取值范围 |
| CONTENT_VIOLATION | 内容违规 | 修改提示词,避免敏感内容 |
| UNSUPPORTED_FEATURE | 不支持的功能 | 检查模型是否支持该功能(如音频生成) |
| IMAGE_REQUIRED | 缺少必需的图片 | 图生视频需提供firstFrameImageUrl |

### 使用流程

1. **获取可用模型配置**
   ```
   调用 getCascadingVideoModels 接口获取模型列表和参数配置
   根据级联结构选择: 模型 → 生成类型 → 分辨率 → 时长 → 宽高比
   ```

2. **提交生成任务**
   ```
   根据选择的参数,调用 generateVideo 接口提交任务
   获取返回的 generationRecordId
   ```

3. **轮询查询状态**
   ```
   使用 generationRecordId 调用 getGenerationStatus 接口查询状态
   建议每5-10秒轮询一次,直到状态变为 SUCCESS 或 FAILED
   ```

4. **获取视频**
   ```
   状态为 SUCCESS 时,从 ossVideoUrl 中获取生成的视频
   可选获取 thumbnailUrl 作为视频封面
   ```

### 模型对比

| 模型 | 提供商 | 文生视频 | 图生视频 | 多图参考 | 音频生成 | 提示词增强 | 首尾帧 |
|------|--------|----------|----------|----------|----------|------------|--------|
| veo3 | FAL | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| hailuo02 | MINIMAX | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| doubao | DOUBAO | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### 参数配置建议

#### 分辨率选择
- **720p** - 快速生成,积分消耗少,适合预览
- **768p** - 平衡质量和速度
- **1080p** - 高清输出,适合最终成品

#### 时长选择
- **4-6秒** - 快速测试,积分消耗少
- **8秒** - 推荐,平衡效果和成本
- **10-16秒** - 长视频,积分消耗高

#### 宽高比选择
- **16:9** - 横屏视频,适合电脑、电视播放
- **9:16** - 竖屏视频,适合手机、短视频平台
- **1:1** - 方形视频,适合社交媒体

### 注意事项

1. **积分消耗**
   - 基础积分 = basePoints
   - 音频生成额外消耗 = audioPoints
   - 提示词增强额外消耗 = enhancePoints
   - 总消耗 = basePoints + (generateAudio ? audioPoints : 0) + (enhancePrompt ? enhancePoints : 0)

2. **轮询频率**
   - 建议5-10秒轮询一次
   - 避免过于频繁的请求
   - 视频生成通常需要1-5分钟

3. **图片要求**
   - 图片需要是可访问的URL
   - 建议使用OSS上传后的URL
   - 图片格式支持: JPG, PNG, WEBP
   - 图片尺寸建议与目标视频分辨率匹配

4. **提示词优化**
   - 使用详细、具体的描述
   - 描述镜头运动、场景变化
   - 合理使用负面提示词
   - 避免敏感、违规内容

5. **模型特性**
   - 不同模型支持的功能不同
   - 使用前检查模型的support字段
   - 某些功能需要额外积分

6. **多图参考生成**
   - 仅Veo 3.1 Standard支持
   - 最多支持10张参考图
   - 图片顺序影响视频过渡效果

---

## 4. 动作控制视频生成

### 1. 提交动作控制视频生成任务

### 接口信息
- **接口路径**: `https://dev.neodomain.cn/agent/user/video/motion-control/generate`
- **请求方式**: `POST`
- **接口描述**: 基于参考图像和参考视频生成动作控制视频
> [!NOTE]
> 任务提交成功后，请使用返回的 `generationRecordId` 调用 [查询视频生成状态](#3-查询视频生成状态) 接口获取任务进度和最终结果。

### 请求参数

#### Headers
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| accessToken | String | 是 | 用户访问令牌 | `eyJhbGciOiJIUzUxMiJ9...` |

#### Body (JSON)
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| imageUrl | String | 是 | 参考图像URL | `https://example.com/image.jpg` |
| videoUrl | String | 是 | 参考视频URL | `https://example.com/video.mp4` |
| prompt | String | 否 | 文本提示词 | `添加背景元素` |
| characterOrientation | String | 是 | 人物朝向(image/video) | `image` |
| mode | String | 是 | 生成模式(std/pro) | `std` |
| keepOriginalSound | String | 否 | 是否保留原声(yes/no) | `yes` |
| videoDuration | Integer | 是 | 视频时长(毫秒) | `5000` |
| shotId | Long | 否 | 分镜ID | `123` |
| sessionId | String | 否 | 会话ID | `abc123` |

### 请求示例
```json
{
  "imageUrl": "https://example.com/ref_image.jpg",
  "videoUrl": "https://example.com/ref_video.mp4",
  "prompt": "Make the character dance",
  "characterOrientation": "image",
  "mode": "pro",
  "keepOriginalSound": "yes",
  "videoDuration": 5000
}
```

### 响应参数

#### 成功响应
```json
{
  "success": true,
  "data": {
    "id": 12345,
    "generationRecordId": "VID_MC_20241201_001",
    "status": "PENDING",
    "statusDesc": "任务已提交",
    "startTime": "2024-12-01T10:30:00"
  },
  "errCode": null,
  "errMessage": null
}
```


