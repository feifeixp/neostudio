# Neodomain 统一 API 接口规范 (面向用户与 AI)

本文档归纳了 Neodomain 平台的核心前台 API，设计为既方便开发者手动查阅，也便于通用大语言模型（如 Claude, OpenClaw 等 AI Agent）作为上下文加载。本规范主要分为五大模块：用户认证与授权、视频生成、图像生成、项目协作管理以及支付。

---

## 全局规范

1. **统一返回体**
   大部分接口返回符合 COLA 架构标准响应格式。
   ```json
   {
     "success": true,
     "data": { ... },       // 业务数据，若失败则为 null
     "errCode": null,       // 失败状态码（成功时可为null）
     "errMessage": null     // 失败提示信息
   }
   ```
2. **认证方式**
   需要在 Request Headers 加 `accessToken: <Your-Token>`。
3. **环境**
   测试环境一般位于 `https://dev.neodomain.cn` ，线上正式位于 `https://story.neodomain.cn`。视需求指定。

---

## 1. 认证模块 (Auth & User)

> 适用范围：登录、发送验证码、多身份选择、查询用户。

### 1.1 发送统一验证码
- **Path**: `POST /user/login/send-unified-code`
- **Body**:
  - `contact` (String, 必填): 手机号或邮箱。
  - `userSource` (String, 默认为 `SELF`): `SELF`, `XIAOMI`, `VOLCANO`。

### 1.2 统一登录 (返回可选的身份)
无论单身份多身份均返回列表，用户（或前端）需根据情况再请求一次选定身份。
- **Path**: `POST /user/login/unified-login/identity`
- **Body**:
  - `contact` (String, 必填): 手机号或邮箱。
  - `code` (String, 必填): 验证码。
- **Response `data`**:
  - `needSelectIdentity` (Boolean): 是否需要选择身份。
  - `identities` (List<LoginIdentityVO>): 包含 `userId`, `userType` (PERSONAL/ENTERPRISE) 等。

### 1.3 选择身份完成登录
- **Path**: `POST /user/login/select-identity`
- **Body**:
  - `userId` (String, 必填): 之前获取的 `userId`。
  - `contact` (String, 必填): 手机号或邮箱。
- **Response `data`**:
  - `authorization` (String): 即 Access Token，**重要**。后续请求请放入 `accessToken` Header。
  - `nickname`, `avatar`, `mobile`, `userType` 等信息。

### 1.4 检查用户是否存在
- **Path**: `POST /user/login/check-exist`
- **Body**:
  - `contact` (String, 必填): 手机号或邮箱。
  - `source` (String, 必填): `LOGIN` 或 `REGISTER`。
- **Response `data`**: `{ "exists": true/false, "contactType": "mobile" }`

---

## 2. 视频生成模块 (Video Generation)

> 支持 T2V, I2V, R2V(参考视频), U2V(全能) 等模式。

### 2.1 获取全能视频模型列表
- **Path**: `GET /agent/user/video/models/universal/byLogin` (建议登录)
- **Query**: `requestType` (Integer, 1-视频工具, 2-画布, 默认 2)
- **Response `data` (List)**:
  - `value`: 模型名称（如 `kling-v3-omni`）。
  - `generationTypes`: 可选的生成类型列表（如 `T2V`, `I2V`, `U2V`）。
  - 支持的功能如 `supportAudioGeneration`, `supportFirstLastFrame` 等配置。

### 2.2 提交视频生成任务
- **Path**: `POST /agent/user/video/generate`
- **Headers**: `accessToken`
- **Body**:
  - `modelName` (String, 必填): 模型标示，例如 `kling-v3-omni`。
  - `generationType` (String, 必填): `T2V`, `I2V`, `R2V`, `U2V` 之一。
  - `prompt` (String, 必填): 提示词。
  - `firstFrameImageUrl` / `lastFrameImageUrl` (String, 选填): 图生视频用。
  - `referenceVideoUrls` (List, 选填): 参考视频生成用。
  - `aspectRatio` (String): 比例，如 `16:9`。
  - `resolution` (String): 解析度，如 `1080p`。
  - `duration` (String): 持续时长，如 `5s`。
- **Response `data`**: 返回任务的 `generationRecordId` 以及 `status` (`PENDING`)。

*(注：任务拉取一般通过长连接或状态查询获得，暂不详述轮询长列表)*

---

## 3. 图片生成模块 (Image Generation)

### 3.1 获取可用图片模型
- **Path**: `GET /agent/ai-image-generation/models/by-scenario`
- **Query**: 
  - `scenarioType` (Integer, 必填): 1-图片工具, 2-画布, 3-重绘等。
- **Response `data` (List)**: 返回 `model_name` (如 `doubao-seedream-4-0`), `supported_aspect_ratios` 等。

### 3.2 提交图片生成任务
- **Path**: `POST /agent/ai-image-generation/generate`
- **Body**:
  - `prompt` (String, 必填): 提示词。
  - `modelName` (String, 必填): 需与 3.1 得到的结果之一匹配。
  - `imageUrls` (List<String>, 选填): 垫图。
  - `aspectRatio` (String, 选填): 如 `16:9`。
  - `numImages` (String, 必填): 图数量，如 `"1"`。
- **Response `data`**: 返回 `task_code` (用于查询) 和状态 `PENDING`。

### 3.3 轮询查询图片生成任务状态
- **Path**: `GET /agent/ai-image-generation/result/{taskCode}`
- **Response `data`**: 
  - `status`: `PENDING`, `SUCCESS`, 或 `FAILED`。
  - `image_urls`: 生成完成后返回数组。

---

## 4. 获取 OSS STS 上传令牌

用户可以通过获取直传 Token 后直接使用阿里云 OSS SDK 传输素材。

- **Path**: `GET /agent/sts/oss/token` (线上对应 `https://story.neodomain.cn`，依据配置走)
- **Response `data`**:
  - `accessKeyId`, `accessKeySecret`, `securityToken`
  - `bucketName`, `expiration`

---

## 5. 项目与协作模块

### 5.1 分页查询协作项目
- **Path**: `POST /agent/project-collaboration/page-query-projects`
- **Body**:
  - `sessionId`, `userId`, `projectName` (选填作查询)。
  - `pageNum`, `pageSize` (选填，分页)。
- **Response `data`**: `CollaborationProjectRes` 数组，含项目名、创建者、成员 `members`。

### 5.2 查询项目积分及操作记录
- **Path**: `GET /agent/project-collaboration/points-history`
- **Query**: `sessionId` (必填), `queryType` (1-获得, 2-消耗，可为空查全部)。

---

## 6. 支付模块

### 6.1 创建支付订单
- **Path**: `POST /agent/pay/order/create`
- **Body**:
  - `subject` (String, 必填): 商品标题。
  - `amount` (Double, 必填): 订单金额（单位：元）。
  - `payType` (Integer, 必填): `1` 代表微信。
- **Response `data`**: `orderNo`, `codeUrl` (扫码用), `wxPayParams`。

### 6.2 查询和关闭订单
- **查询状态 Path**: `GET /agent/pay/order/status?orderNo={orderNo}`
- **关闭订单 Path**: `POST /agent/pay/order/close?orderNo={orderNo}` 
  (注意：仅对于处于 “支付中 (status: 1)” 的订单有效)。

---

> 该 API 规范已经高度总结，随时适合被 AI CLI 和 Node.js SDK 读取，帮助代理机器人实现全流程的“登录、建组、支付、生图、生视频”的一条龙工作流。
