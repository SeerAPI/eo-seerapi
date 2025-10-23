# EO-SeerAPI

部署在腾讯云EdgeOne Pages上的SeerAPI服务，用于提供符合RESTful API设计规范的赛尔号游戏数据的接口。

## 📖 项目简介

EO-SeerAPI 是一个基于腾讯云 EdgeOne Pages 的边缘函数服务，为赛尔号游戏数据提供高性能、全球分布式的 RESTful API 接口。
## ✨ 功能特性

- **RESTful API 设计** - 遵循 REST 架构规范，提供清晰的资源访问接口
- **分页查询支持** - 支持 `offset` 和 `limit` 参数的分页查询，符合 RFC 5988 Link Header 规范
- **JSON Schema 支持** - 提供完整的 API Schema 定义，通过 `describedby` 关系链接
- **ETag 缓存机制** - 支持 HTTP ETag 缓存，减少不必要的数据传输
- **CORS 跨域支持** - 允许跨域请求，方便前端应用调用
- **错误重试机制** - 内置请求重试逻辑，提高服务可靠性
- **边缘计算加速** - 基于 EdgeOne 边缘节点，提供全球低延迟访问

## 🛠 技术栈

- **运行时**: Node.js 22.11.0
- **语言**: TypeScript
- **部署平台**: 腾讯云 EdgeOne Pages

## 📁 项目结构

```
eo-seerapi/
├── node-functions/          # EdgeOne Pages Functions
│   └── v1/
│       ├── [[default]].ts        # 主要数据接口处理器
│       ├── index.ts              # 导出接口
│       ├── _common.ts            # 公共工具和配置
│       └── schemas/              # Schema 接口
│           ├── [[default]].ts    # Schema 处理器
│           └── index.ts          # 导出接口
├── edgeone.json             # EdgeOne 配置文件
├── package.json             # 项目依赖配置
├── tsconfig.json            # TypeScript 配置
├── .gitignore               # Git 忽略文件配置
└── README.md                # 项目文档
```

## 🔌 API 文档

### 基础信息

- **基础 URL**: 通过环境变量 `API_BASE_URL` 配置
- **数据源 URL**: 通过环境变量 `API_DATA_BASE_URL` 配置
- **Schema 源 URL**: 通过环境变量 `API_SCHEMA_BASE_URL` 配置

### 数据接口

#### 获取资源列表/详情

```http
GET /api/v1/{resource_path}
```

**查询参数**:
- `offset` (可选): 分页偏移量，默认为 0
- `limit` (可选): 每页数量，默认为 20

**响应头**:
- `Content-Type`: `application/schema-instance+json`
- `Link`: RFC 5988 规范的链接头，包含 `next`, `prev`, `first`, `last`, `describedby` 关系
- `ETag`: 资源版本标识

**分页响应示例**:
```json
{
  "count": 100,
  "next": "https://api.example.com/api/v1/resource?offset=20&limit=20",
  "previous": null,
  "first": "https://api.example.com/api/v1/resource?offset=0&limit=20",
  "last": "https://api.example.com/api/v1/resource?offset=80&limit=20",
  "results": [
    // ... 数据项
  ]
}
```

**单个资源响应示例**:
```json
{
  // ... 资源数据
}
```

### Schema 接口

#### 获取资源 Schema

```http
GET /api/v1/schemas/{resource_path}
```

**响应头**:
- `Content-Type`: `application/schema+json`
- `ETag`: Schema 版本标识

**响应示例**:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    // ... Schema 定义
  }
}
```

### 跨域支持

所有接口都支持 OPTIONS 预检请求，响应头包含：
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, If-None-Match`

## 📝 特性

### 分页机制

项目实现了完整的 RFC 5988 Link Header 规范：
- 自动计算 `first`, `last`, `next`, `previous` 链接
- 支持自定义 `offset` 和 `limit` 参数
- 在响应体和 `Link` 头中同时提供分页信息

### Schema 关联

每个数据接口都通过 `Link` 头的 `describedby` 关系关联到对应的 Schema 接口，支持客户端自动验证和文档生成。

### 缓存策略

- 使用 ETag 进行条件请求
- 支持 `If-None-Match` 头
- 动态提取数据中的 `hash` 字段作为 ETag

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

---

## 📚 相关资源

- [EdgeOne Pages 文档](https://cloud.tencent.com/document/product/1552)
- [API 数据源](https://github.com/SeerAPI/api-data)
- [API 数据整理工具](https://github.com/SeerAPI/solaris)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
