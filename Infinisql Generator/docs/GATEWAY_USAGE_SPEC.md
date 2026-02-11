# AI Gateway Usage 透传规范

为支持缓存测试和 token 统计，AI Gateway 需在 `completion_result` 消息中透传底层 API 的 `usage` 信息。

## 1. 数据来源

调用阿里云 DashScope / OpenAI 兼容接口时，响应中包含：

```json
{
  "usage": {
    "prompt_tokens": 2409,
    "completion_tokens": 110,
    "total_tokens": 2519,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "cache_creation_input_tokens": 2404
    }
  }
}
```

- `cached_tokens`: 命中缓存的 token 数
- `cache_creation_input_tokens`: 本次请求创建的缓存 token 数（仅显式缓存有）

## 2. Gateway 修改建议

在发送 `completion_result` 或 `partialMessage` 时，将 `usage` 一并放入消息体。

### 2.1 partialMessage 格式

当前结构示例：
```javascript
{
  type: 'partialMessage',
  partialMessage: {
    say: 'completion_result',
    text: '...'
  }
}
```

修改后：
```javascript
{
  type: 'partialMessage',
  partialMessage: {
    say: 'completion_result',
    text: '...',
    usage: {
      prompt_tokens: 2409,
      completion_tokens: 110,
      total_tokens: 2519,
      prompt_tokens_details: {
        cached_tokens: 0,
        cache_creation_input_tokens: 2404
      }
    }
  }
}
```

### 2.2 state 中的 clineMessages

若 `completion_result` 出现在 `state.clineMessages` 中，则在对应消息对象上增加 `usage` 字段：

```javascript
{
  say: 'completion_result',
  text: '...',
  usage: {
    prompt_tokens: 2409,
    completion_tokens: 110,
    prompt_tokens_details: {
      cached_tokens: 0,
      cache_creation_input_tokens: 2404
    }
  }
}
```

## 3. 实现要点

1. 在调用 LLM API 后，从响应中读取 `usage` 对象
2. 若 API 未返回 `usage`（如部分旧实现），则 `usage` 可为 `null` 或省略
3. `prompt_tokens_details` 可能不存在（部分模型/接口），需做空值判断
4. 透传时保持字段名与阿里云 API 一致，便于客户端解析

## 4. 客户端兼容

本目录客户端（`infinisql_client.js` / `src/`）在解析 Gateway 消息时可：
- 解析并显示 `usage`（若 Gateway 透传）
- 无 `usage` 时按现有逻辑处理，不依赖该字段
