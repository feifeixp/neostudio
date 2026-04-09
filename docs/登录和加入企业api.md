# 统一登录及多身份选择接口文档

本文档包含了多身份统一登录流程的核心接口说明，包括发送验证码、统一登录验证以及选择身份完成最终登录的步骤。

## 1. 统一发送验证码接口

支持使用手机号或邮箱发送验证码。

- **接口地址**: `/user/login/send-unified-code`
- **请求方式**: `POST`
- **Content-Type**: `application/json`

### 请求参数 (SendMobileCodeReq)

| 参数名 | 类型 | 必填 | 默认值 | 描述 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `contact` | String | 是 | - | 手机号或邮箱地址 | `13800138000` 或 `user@example.com` |
| `userSource` | String | 否 | `SELF` | 用户来源（`SELF`, `XIAOMI`, `VOLCANO`）| `SELF` |

### 响应数据

返回标准的 COLA `Response`。

```json
{
  "success": true,
  "errCode": "200",
  "errMessage": "success"
}
```

---

## 2. 统一登录接口（支持多身份）

验证手机号或邮箱与验证码。无论单身份还是多身份，均返回身份列表，前端如果判断 `needSelectIdentity=true` 需要提供界面供用户选择身份，并调用`/select-identity`接口完成最终登录。

- **接口地址**: `/user/login/unified-login/identity`
- **请求方式**: `POST`
- **Content-Type**: `application/json`

### 请求参数 (UnifiedLoginReq)

| 参数名 | 类型 | 必填 | 默认值 | 描述 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `contact` | String | 是 | - | 手机号或邮箱地址 | `13800138000` 或 `user@example.com` |
| `code` | String | 是 | - | 验证码（4-6位） | `123456` |
| `invitationCode` | String | 否 | - | 邀请码 | `INVITE123` |
| `userSource` | String | 否 | `SELF` | 用户来源（`SELF`, `XIAOMI`, `VOLCANO`）| `SELF` |

### 响应数据 (SingleResponse&lt;LoginIdentityListRes&gt;)

返回包含身份选择标识的实体。

**data 字段结构：**

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| `needSelectIdentity` | Boolean | 是否需要选择身份（当前逻辑下始终返回数据供选择） |
| `identities` | List | 身份列表（`needSelectIdentity=true` 时有值） |

**identities 列表项 `LoginIdentityVO` 字段结构：**

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| `userId` | String | 用户 ID |
| `userType` | String | 用户类型: `PERSONAL`-个人用户, `ENTERPRISE`-企业用户 |
| `enterpriseId` | String | 企业 ID（仅企业用户时有值） |
| `enterpriseName` | String | 企业名称（仅企业用户时有值） |
| `enterpriseCode` | String | 企业编码（仅企业用户时有值） |
| `nickname` | String | 用户昵称 |
| `avatar` | String | 用户头像 URL |
| `role` | String | 企业内角色（仅企业用户时有值） |

---

## 3. 选择身份登录接口

多身份登录流程中，用户选择某个具体身份后调用此接口完成最终的 Token 生成和登录逻辑。

- **接口地址**: `/user/login/select-identity`
- **请求方式**: `POST`
- **Content-Type**: `application/json`

### 请求参数 (IdentityLoginReq)

| 参数名 | 类型 | 必填 | 描述 | 示例 |
| --- | --- | --- | --- | --- |
| `userId` | String | 是 | 选择的用户 ID | `1234567890` |
| `contact` | String | 是 | 联系方式（手机号或邮箱，用于校验Redis验证通过标记）| `13800138000` |

### 响应数据 (SingleResponse&lt;UserLoginRes&gt;)

登录成功后返回用户的认证信息和个人基本信息。

**data 字段结构：**

| 参数名 | 类型 | 描述 | 示例 |
| --- | --- | --- | --- |
| `authorization` | String | 认证令牌 (JWT Token) | `eyJhbGciOiJIUzUxMiJ9...` |
| `userId` | String | 用户 ID | `1234567890` |
| `email` | String | 用户邮箱 | `test@example.com` |
| `mobile` | String | 用户手机号（掩码处理后返回） | `138****8000` |
| `nickname` | String | 用户昵称 | `John Doe` |
| `avatar` | String | 用户头像 URL | `https://example.com/avatar.jpg` |
| `status` | Integer | 用户状态：`0`-未激活，`1`-正常，`2`-禁用 | `1` |
| `userType` | String | 用户类型：`PERSONAL`-个人用户, `ENTERPRISE`-企业用户 | `PERSONAL` |
| `enterpriseId` | String | 企业 ID（企业用户时有值） | - |
| `enterpriseName`| String | 企业名称（企业用户时有值） | - |

---

## 4. 新增企业成员（活动）接口

通过活动渠道（无需进行管理员鉴权校验）添加企业成员。在处理逻辑中，该接口会确保在 `ai_users` (使用 ENTERPRISE 账户类型进行复用或创建) 和 `ai_enterprise_members` 中创建并插入对应关联记录。

- **接口地址**: `/ucenter/enterprise/members/addMember`
- **请求方式**: `POST`
- **Content-Type**: `application/json`

### 请求参数 (EnterpriseMemberAddReq)

| 参数名 | 类型 | 必填 | 默认值 | 描述 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `enterpriseId` | String | 是 | - | 企业唯一 ID | `12345678` |
| `phone` | String | 是 | - | 成员手机号 | `13800138000` |
| `nickname` | String | 否 | - | 成员昵称（最大 50 字符） | `张三` |
| `role` | String | 否 | `MEMBER` | 企业内角色（`ADMIN` 或 `MEMBER`） | `MEMBER` |
| `memberNickname`| String | 否 | - | 企业内显示名称/花名（最大 50 字符） | `阿土` |
| `department` | String | 否 | - | 所属部门（最大 100 字符） | `研发中心` |
| `position` | String | 否 | - | 职位/岗位（最大 100 字符） | `Java开发工程师` |

### 响应数据 (SingleResponse&lt;String&gt;)

返回新创建（或关联匹配到）的企业成员关系记录标识。

**data 字段结构：**

| 参数名 | 类型 | 描述 | 示例 |
| --- | --- | --- | --- |
| `data` | String | 生成或存在的企业成员唯一 ID (`memberId`) | `65f12a3b4c9e...` |
