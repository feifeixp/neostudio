# 提交视频生成任务 API 接口文档

## 基本信息

| 项目 | 说明 |
|------|------|
| **接口路径** | `/agent/user/video/generate` |
| **请求方式** | `POST` |
| **Content-Type** | `application/json` |
| **接口描述** | 提交视频生成任务，支持文生视频(T2V)、图生视频(I2V)、参考视频生成(R2V)、全能模型生成(U2V) |

---

## 请求参数

### 请求体（JSON Body）

| 参数名 | 类型 | 必填 | 默认值 | 说明 | 示例 |
|--------|------|------|--------|------|------|
| `shotId` | Long | 否 | - | 分镜ID | `1` |
| `sourceType` | String | 否 | - | 数据来源类型：`USER_DIRECT`-用户直接生成，`CANVAS_SHOT`-Canvas分镜生成 | `USER_DIRECT` |
| `modelName` | String | **是** | - | 模型名称 | `kling-v3-omni` |
| `generationType` | String | **是** | - | 生成类型，可选值：`T2V`（文生视频）、`I2V`（图生视频）、`R2V`（参考视频生成）、`U2V`（全能模型） | `U2V` |
| `prompt` | String | **是** | - | 提示词 | `A futuristic city at night` |
| `negativePrompt` | String | 否 | - | 负面提示词 | `blurry, low quality` |
| `firstFrameImageUrl` | String | 否 | - | 首帧图片URL（图生视频或全能模型时使用） | `https://example.com/first.jpg` |
| `lastFrameImageUrl` | String | 否 | - | 尾帧图片URL（全能模型时使用） | `https://example.com/last.jpg` |
| `referenceVideoUrls` | List\<String\> | 否 | - | 全能模型参考视频URL列表 | `["https://example.com/ref_video.mp4"]` |
| `videoReferType` | String | 否 | - | 视频参考类型：`feature`（特征参考）、`base`（待编辑视频） | `base` |
| `keepOriginalSound` | String | 否 | - | 是否保留视频原声：`yes`、`no` | `yes` |
| `imageUrls` | List\<String\> | 否 | - | 多图参考生成视频时的参考图列表 | `["https://example.com/img1.jpg"]` |
| `audioUrl` | List\<String\> | 否 | - | 音频URL列表 | `["https://example.com/audio.mp3"]` |
| `aspectRatio` | String | 否 | - | 视频宽高比 | `16:9` |
| `resolution` | String | 否 | - | 视频分辨率 | `1080p` |
| `duration` | String | 否 | - | 视频时长 | `5s` |
| `seed` | Integer | 否 | - | 随机种子 | `12345` |
| `generateAudio` | Boolean | 否 | `false` | 是否生成音频 | `false` |
| `enhancePrompt` | Boolean | 否 | `false` | 是否启用提示词增强 | `false` |
| `promptOptimizer` | Boolean | 否 | `false` | 是否使用提示词优化器 | `false` |
| `draft` | Boolean | 否 | `false` | 是否生成草稿视频 | `false` |
| `sessionId` | String | 否 | - | 会话ID | `sess_abc123` |
| `totalDuration` | Integer | 否 | - | 参考视频的总时长（秒），用于计算总积分 = 总时长 × 每秒积分单价 | `30` |

---

## 请求示例

```json
{
  "modelName": "kling-v3-omni",
  "generationType": "I2V",
  "prompt": "A futuristic city at night with neon lights",
  "negativePrompt": "blurry, low quality",
  "firstFrameImageUrl": "https://example.com/first.jpg",
  "aspectRatio": "16:9",
  "resolution": "1080p",
  "duration": "5s",
  "generateAudio": false,
  "enhancePrompt": true,
  "draft": false,
  "totalDuration": 5
}
```

---

## 响应参数

### 通用响应结构（`SingleResponse<UserVideoGenerationRes>`）

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `success` | Boolean | 是否成功 |
| `errCode` | String | 错误码 |
| `errMessage` | String | 错误信息 |
| `data` | Object | 响应数据，详见下表 |

### data 字段说明（`UserVideoGenerationRes`）

| 参数名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `id` | Long | 记录ID | `1001` |
| `generationRecordId` | String | 生成记录ID | `gen_abc123` |
| `modelProvider` | String | 模型提供商 | `kling` |
| `generationType` | String | 生成类型 | `I2V` |
| `prompt` | String | 提示词 | `A futuristic city at night` |
| `negativePrompt` | String | 负面提示词 | `blurry` |
| `firstFrameImageUrl` | String | 首帧图片URL | `https://example.com/first.jpg` |
| `lastFrameImageUrl` | String | 尾帧图片URL | `https://example.com/last.jpg` |
| `imageUrls` | List\<String\> | 参考图片URL列表 | `["https://example.com/img1.jpg"]` |
| `videoUrls` | List\<String\> | 参考视频URL列表 | `["https://example.com/ref.mp4"]` |
| `audioUrls` | List\<String\> | 参考音频URL列表 | `["https://example.com/audio.mp3"]` |
| `aspectRatio` | String | 视频宽高比 | `16:9` |
| `resolution` | String | 视频分辨率 | `1080p` |
| `duration` | Integer | 视频时长 | `5` |
| `fps` | Integer | 帧率 | `30` |
| `seed` | Integer | 随机种子 | `12345` |
| `draft` | Integer | 是否草稿模式：`1`-是，`0`-否 | `0` |
| `status` | String | 任务状态，可选值：`PENDING`（等待中）、`PROCESSING`（处理中）、`SUCCESS`（成功）、`FAILED`（失败） | `PENDING` |
| `statusDesc` | String | 状态描述 | `排队中` |
| `ossVideoUrl` | String | OSS视频URL（生成成功后返回） | `https://oss.example.com/video.mp4` |
| `thumbnailUrl` | String | 缩略图URL | `https://oss.example.com/thumb.jpg` |
| `videoDurationSeconds` | BigDecimal | 实际视频时长（秒） | `5.0` |
| `errorMessage` | String | 错误信息（失败时返回） | `Generation failed` |
| `errorCode` | String | 错误代码（失败时返回） | `MODEL_ERROR` |
| `startTime` | Date | 开始处理时间 | `2025-04-12T10:00:00` |
| `completeTime` | Date | 完成时间 | `2025-04-12T10:01:30` |

---

## 响应示例

### 成功响应

```json
{
  "success": true,
  "errCode": null,
  "errMessage": null,
  "data": {
    "id": 1001,
    "generationRecordId": "gen_abc123",
    "modelProvider": "kling",
    "generationType": "I2V",
    "prompt": "A futuristic city at night with neon lights",
    "negativePrompt": "blurry, low quality",
    "firstFrameImageUrl": "https://example.com/first.jpg",
    "lastFrameImageUrl": null,
    "imageUrls": null,
    "videoUrls": null,
    "audioUrls": null,
    "aspectRatio": "16:9",
    "resolution": "1080p",
    "duration": 5,
    "fps": 24,
    "seed": null,
    "draft": 0,
    "status": "PENDING",
    "statusDesc": "排队中",
    "ossVideoUrl": null,
    "thumbnailUrl": null,
    "videoDurationSeconds": null,
    "errorMessage": null,
    "errorCode": null,
    "startTime": null,
    "completeTime": null
  }
}
```

### 失败响应（参数校验失败）

```json
{
  "success": false,
  "errCode": "INVALID_PARAM",
  "errMessage": "模型名称不能为空",
  "data": null
}
```

---

## 生成类型说明

| 类型 | 说明 | 必需参数 |
|------|------|----------|
| `T2V` | 文生视频 | `prompt` |
| `I2V` | 图生视频 | `prompt` + `firstFrameImageUrl` |
| `R2V` | 参考视频生成 | `prompt` + `referenceVideoUrls` |
| `U2V` | 全能模型 | `prompt`，可选 `firstFrameImageUrl`、`lastFrameImageUrl`、`referenceVideoUrls`、`imageUrls`、`audioUrl` |

---

## 任务状态流转

```
PENDING → PROCESSING → SUCCESS
                    → FAILED
```

| 状态 | 说明 |
|------|------|
| `PENDING` | 任务已提交，等待处理 |
| `PROCESSING` | 任务正在生成中 |
| `SUCCESS` | 视频生成成功 |
| `FAILED` | 视频生成失败 |

---
---

# 获取可用的视频模型级联列表V2（需登录）

## 基本信息

| 项目 | 说明 |
|------|------|
| **接口路径** | `/agent/user/video/models/cascading/v2/byLogin` |
| **请求方式** | `GET` |
| **需要登录** | 是 |
| **接口描述** | 需要登录，获取支持级联选择的视频模型配置信息（时长范围 + 按秒计费） |

---

## 请求参数

### Query 参数

| 参数名 | 类型 | 必填 | 默认值 | 说明 | 示例 |
|--------|------|------|--------|------|------|
| `requestType` | Integer | 否 | `2` | 请求类型：`1`-视频工具，`2`-画布 | `2` |

---

## 响应参数

### 通用响应结构（`MultiResponse<VideoCascadingModelV2Res>`）

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `success` | Boolean | 是否成功 |
| `errCode` | String | 错误码 |
| `errMessage` | String | 错误信息 |
| `data` | List\<Object\> | 响应数据列表，详见下表 |

### data 数组元素说明（`VideoCascadingModelV2Res`）

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `value` | String | 模型名称 |
| `name` | String | 模型显示名称 |
| `description` | String | 模型描述 |
| `tags` | List\<String\> | 模型标签列表 |
| `provider` | String | 提供商 |
| `supportAudio` | Integer | 是否支持音频生成：`0`-不支持，`1`-支持可选，`2`-必须生成音频 |
| `supportAudioUpload` | Boolean | 是否支持上传音频 |
| `supportFirstLastFrame` | Boolean | 是否支持首尾帧生成视频 |
| `supportReferenceToVideo` | Boolean | 是否支持多图参考生成视频 |
| `supportReferenceToVideoSize` | Integer | 多图参考最大数量（`0`表示不支持，大于`0`表示支持的最大图片数量） |
| `supportDraft` | Boolean | 是否支持草稿模式 |
| `durationRange` | Object | 时长范围配置，详见 [DurationRangeConfig](#durationrangeconfig) |
| `membershipRequired` | Boolean | 是否必须会员才能使用 |
| `allowedMembershipLevelCodes` | List\<String\> | 允许使用的会员等级code列表（为空表示所有会员均可） |
| `isUniversalModel` | Boolean | 是否为全能模型（U2V） |
| `featureConfig` | Object | 功能能力配置，详见 [FeatureConfig](#featureconfig) |
| `generationTypes` | List\<Object\> | 生成类型配置列表，详见 [GenerationTypeConfig](#generationtypeconfig) |
| `hasDiscount` | Boolean | 是否有折扣 |
| `discountRate` | BigDecimal | 折扣率（0-1，如0.8表示8折） |

### DurationRangeConfig

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `min` | Integer | 最小时长（秒） |
| `max` | Integer | 最大时长（秒） |
| `step` | Integer | 步长（秒） |

### FeatureConfig

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `supportAudioGeneration` | Integer | 是否支持音频生成：`0`-不支持，`1`-支持可选，`2`-必须生成音频 |
| `supportAudioUpload` | Boolean | 是否支持上传音频 |
| `supportDraft` | Boolean | 是否支持草稿模式 |
| `supportFirstLastFrame` | Boolean | 是否支持首尾帧生成视频 |
| `supportWatermark` | Boolean | 是否包含水印 |
| `supportReferenceToVideo` | Boolean | 是否支持参考图/视频生成 |
| `supportReferenceToVideoSize` | Integer | 参考图最大数量 |
| `supportReferenceImage` | Boolean | 是否支持图片参考 |
| `supportReferenceVideo` | Boolean | 是否支持视频参考 |
| `supportReferenceAudio` | Boolean | 是否支持音频参考 |
| `maxReferenceImages` | Integer | 图片最大数量限制 |
| `maxReferenceVideos` | Integer | 视频最大数量限制 |
| `maxReferenceAudios` | Integer | 音频最大数量限制 |
| `comboLimits` | Object | 参考组合限制规则 |
| `extraLimits` | Object | 扩展限制（JSON） |

### GenerationTypeConfig

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `value` | String | 生成类型值 |
| `name` | String | 生成类型显示名称 |
| `resolutions` | List\<Object\> | 分辨率配置列表，详见 [ResolutionConfig](#resolutionconfig) |

### ResolutionConfig

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `value` | String | 分辨率值 |
| `name` | String | 分辨率显示名称 |
| `aspectRatios` | List\<Object\> | 宽高比配置列表，详见 [AspectRatioConfig](#aspectratioconfig) |

### AspectRatioConfig

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `value` | String | 宽高比值 |
| `name` | String | 宽高比显示名称 |
| `pointsPerSecond` | Integer | 每秒基础积分 |
| `pointsPerSecondWithAudio` | Integer | 有音频时每秒积分 |
| `pointsPerSecondWithRefVideo` | Integer | 无音频有参考视频时每秒积分 |
| `pointsPerSecondWithAudioAndRefVideo` | Integer | 有音频且有参考视频时每秒积分 |

---

## 响应示例

```json
{
  "success": true,
  "errCode": null,
  "errMessage": null,
  "data": [
    {
      "value": "kling-v3-omni",
      "name": "Kling V3 Omni",
      "description": "支持多种生成类型的高质量视频模型",
      "tags": ["高清", "快速"],
      "provider": "kling",
      "supportAudio": 1,
      "supportAudioUpload": true,
      "supportFirstLastFrame": true,
      "supportReferenceToVideo": true,
      "supportReferenceToVideoSize": 4,
      "supportDraft": true,
      "durationRange": {
        "min": 5,
        "max": 30,
        "step": 1
      },
      "membershipRequired": false,
      "allowedMembershipLevelCodes": [],
      "isUniversalModel": false,
      "featureConfig": {
        "supportAudioGeneration": 1,
        "supportAudioUpload": true,
        "supportDraft": true,
        "supportFirstLastFrame": true,
        "supportWatermark": false,
        "supportReferenceToVideo": true,
        "supportReferenceToVideoSize": 4,
        "supportReferenceImage": true,
        "supportReferenceVideo": true,
        "supportReferenceAudio": true,
        "maxReferenceImages": 4,
        "maxReferenceVideos": 1,
        "maxReferenceAudios": 1,
        "comboLimits": null,
        "extraLimits": null
      },
      "generationTypes": [
        {
          "value": "T2V",
          "name": "文生视频",
          "resolutions": [
            {
              "value": "1080p",
              "name": "1080P",
              "aspectRatios": [
                {
                  "value": "16:9",
                  "name": "16:9",
                  "pointsPerSecond": 10,
                  "pointsPerSecondWithAudio": 12,
                  "pointsPerSecondWithRefVideo": 15,
                  "pointsPerSecondWithAudioAndRefVideo": 18
                }
              ]
            }
          ]
        }
      ],
      "hasDiscount": false,
      "discountRate": null
    }
  ]
}
```

---
---

# 获取全能视频模型列表（需登录）

## 基本信息

| 项目 | 说明 |
|------|------|
| **接口路径** | `/agent/user/video/models/universal/byLogin` |
| **请求方式** | `GET` |
| **需要登录** | 是 |
| **接口描述** | 需要登录，获取支持多参考输入的 U2V 全能模型配置信息 |

---

## 请求参数

### Query 参数

| 参数名 | 类型 | 必填 | 默认值 | 说明 | 示例 |
|--------|------|------|--------|------|------|
| `requestType` | Integer | 否 | `2` | 请求类型：`1`-视频工具，`2`-画布 | `2` |

---

## 响应参数

### 通用响应结构（`MultiResponse<VideoUniversalModelRes>`）

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `success` | Boolean | 是否成功 |
| `errCode` | String | 错误码 |
| `errMessage` | String | 错误信息 |
| `data` | List\<Object\> | 响应数据列表，详见下表 |

### data 数组元素说明（`VideoUniversalModelRes`）

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `value` | String | 模型名称 |
| `name` | String | 模型显示名称 |
| `description` | String | 模型描述 |
| `provider` | String | 提供商 |
| `tags` | List\<String\> | 模型标签列表 |
| `membershipRequired` | Boolean | 是否必须会员才能使用 |
| `allowedMembershipLevelCodes` | List\<String\> | 允许使用的会员等级code列表 |
| `durationRange` | Object | 时长范围配置，详见 [DurationRangeConfig](#durationrangeconfig-1) |
| `featureConfig` | Object | 功能能力配置，详见 [FeatureConfig（全能模型）](#featureconfig全能模型) |
| `generationTypes` | List\<Object\> | 生成类型配置列表，详见 [GenerationTypeConfig](#generationtypeconfig-1) |
| `resolutions` | List\<Object\> | 分辨率配置列表，详见 [ResolutionConfig](#resolutionconfig-1) |
| `hasDiscount` | Boolean | 是否有折扣 |
| `discountRate` | BigDecimal | 折扣率（0-1，如0.8表示8折） |

### DurationRangeConfig

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `min` | Integer | 最小时长（秒） |
| `max` | Integer | 最大时长（秒） |
| `step` | Integer | 步长（秒） |

### FeatureConfig（全能模型）

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `supportAudioGeneration` | Integer | 是否支持音频生成 |
| `supportAudioUpload` | Boolean | 是否支持上传音频 |
| `supportDraft` | Boolean | 是否支持草稿模式 |
| `supportFirstLastFrame` | Boolean | 是否支持首尾帧生成视频 |
| `supportWatermark` | Boolean | 是否支持水印 |
| `supportReferenceImage` | Boolean | 是否支持图片参考 |
| `supportReferenceVideo` | Boolean | 是否支持视频参考 |
| `supportReferenceAudio` | Boolean | 是否支持音频参考 |
| `maxReferenceImages` | Integer | 图片最大数量上限 |
| `maxReferenceVideos` | Integer | 视频最大数量上限 |
| `maxReferenceAudios` | Integer | 音频最大数量上限 |
| `comboLimits` | Object | 参考组合限制规则 |
| `extraLimits` | Object | 扩展限制（JSON） |

### GenerationTypeConfig

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `value` | String | 生成类型值 |
| `name` | String | 生成类型显示名称 |
| `resolutions` | List\<Object\> | 分辨率配置列表 |

### ResolutionConfig

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `value` | String | 分辨率值 |
| `name` | String | 分辨率显示名称 |
| `aspectRatios` | List\<Object\> | 宽高比配置列表，详见 [AspectRatioConfig](#aspectratioconfig-1) |

### AspectRatioConfig

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `value` | String | 宽高比值 |
| `name` | String | 宽高比显示名称 |
| `pointsPerSecond` | Integer | 每秒基础积分 |
| `pointsPerSecondWithAudio` | Integer | 有音频时每秒积分 |
| `pointsPerSecondWithRefVideo` | Integer | 无音频有参考视频时每秒积分 |
| `pointsPerSecondWithAudioAndRefVideo` | Integer | 有音频且有参考视频时每秒积分 |

---

## 响应示例

```json
{
  "success": true,
  "errCode": null,
  "errMessage": null,
  "data": [
    {
      "value": "kling-v3-omni",
      "name": "Kling V3 全能",
      "description": "支持多种参考输入的全能视频生成模型",
      "provider": "kling",
      "tags": ["全能", "U2V"],
      "membershipRequired": false,
      "allowedMembershipLevelCodes": [],
      "durationRange": {
        "min": 5,
        "max": 30,
        "step": 1
      },
      "featureConfig": {
        "supportAudioGeneration": 1,
        "supportAudioUpload": true,
        "supportDraft": true,
        "supportFirstLastFrame": true,
        "supportWatermark": false,
        "supportReferenceImage": true,
        "supportReferenceVideo": true,
        "supportReferenceAudio": true,
        "maxReferenceImages": 4,
        "maxReferenceVideos": 1,
        "maxReferenceAudios": 1,
        "comboLimits": null,
        "extraLimits": null
      },
      "generationTypes": [
        {
          "value": "U2V",
          "name": "全能生成",
          "resolutions": [
            {
              "value": "1080p",
              "name": "1080P",
              "aspectRatios": [
                {
                  "value": "16:9",
                  "name": "16:9",
                  "pointsPerSecond": 10,
                  "pointsPerSecondWithAudio": 12,
                  "pointsPerSecondWithRefVideo": 15,
                  "pointsPerSecondWithAudioAndRefVideo": 18
                }
              ]
            }
          ]
        }
      ],
      "resolutions": [
        {
          "value": "1080p",
          "name": "1080P",
          "aspectRatios": [
            {
              "value": "16:9",
              "name": "16:9",
              "pointsPerSecond": 10,
              "pointsPerSecondWithAudio": 12,
              "pointsPerSecondWithRefVideo": 15,
              "pointsPerSecondWithAudioAndRefVideo": 18
            }
          ]
        }
      ],
      "hasDiscount": false,
      "discountRate": null
    }
  ]
}
```
