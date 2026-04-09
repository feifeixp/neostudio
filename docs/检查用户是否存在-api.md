# 检查用户是否存在接口 API 文档

## 1. 接口说明
本接口用于在登录或注册场景下检查用户是否存在，支持通过手机号或邮箱进行校验。

## 2. 接口信息
- **接口路径**: `/user/login/check-exist`
- **请求方式**: `POST`
- **请求类型**: `application/json`

## 3. 请求参数

| 参数名  | 参数类型 | 必填 | 默认值 | 描述说明                                                                                           |
| :------ | :------- | :--- | :----- | :------------------------------------------------------------------------------------------------- |
| contact | String   | 是   | -      | 手机号或邮箱地址。例如：`13800138000` 或 `user@example.com`。                                      |
| source  | String   | 是   | -      | 检查来源。枚举值：<br>`LOGIN`: 登录场景（只要用户存在即有效）<br>`REGISTER`: 注册场景（限个人用户存在有效） |

### 请求示例
```json
{
  "contact": "13800138000",
  "source": "LOGIN"
}
```

## 4. 响应参数

外层包装通用 `SingleResponse` 对象，业务数据包含在 `data` 字段内。

| 参数名                  | 参数类型 | 描述说明                              |
| :---------------------- | :------- | :------------------------------------ |
| success                 | Boolean  | 请求是否成功                          |
| errCode                 | String   | 错误码（请求失败时返回）              |
| errMessage              | String   | 错误信息（请求失败时返回，如校验提示） |
| data                    | Object   | 响应数据对象，详见下方 `data` 字段说明   |

### data 字段说明 (CheckUserExistRes)

| 参数名      | 参数类型 | 描述说明                            |
| :---------- | :------- | :---------------------------------- |
| exists      | Boolean  | 用户是否存在（`true`: 存在，`false`: 不存在） |
| contactType | String   | 联系方式类型（枚举值：`email` / `mobile`）     |

### 响应示例（成功）
```json
{
  "success": true,
  "errCode": null,
  "errMessage": null,
  "data": {
    "exists": true,
    "contactType": "mobile"
  }
}
```

### 响应示例（失败 - 参数校验不通过）
```json
{
  "success": false,
  "errCode": "PARAM_ERROR",
  "errMessage": "请输入有效的手机号或邮箱地址",
  "data": null
}
```
