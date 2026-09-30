# 导入说明（自动生成，勿手改；改 `rules/` 与 `repo.config.json` 后运行 `npm run build`）

本仓库把「特定域名走哪个出口」的**增量规则**发布成可公网订阅的文件。客户端自己的 GeoIP/GeoSite 国内外分流保持不变，本规则集只做叠加与修正。

## 可用文件

| 文件 | 用途 | 说明 | 首选 URL |
| --- | --- | --- | --- |
| `dist/v2ray-rules.json` | 路由规则集（增量） | v2rayN 路由规则集订阅 URL / v2rayNG 剪贴板、二维码导入 | `https://gh-proxy.com/https://raw.githubusercontent.com/afoim/v2_remote_config_rules/main/dist/v2ray-rules.json` |
| `dist/xray-client-config.json` | 完整 Xray 客户端配置 | 客户端「自定义配置」直接使用（节点为占位符，需替换） | `https://gh-proxy.com/https://raw.githubusercontent.com/afoim/v2_remote_config_rules/main/dist/xray-client-config.json` |
| `dist/xray-routing-increment.json` | Xray routing 增量片段 | 手工合并进你已有的 Xray 配置 | `https://gh-proxy.com/https://raw.githubusercontent.com/afoim/v2_remote_config_rules/main/dist/xray-routing-increment.json` |

### 全部镜像

| 可用性 | URL 模板 |
| --- | --- |
| 国内实测可达，实时回源 raw，无缓存（第三方代理服务） | `https://gh-proxy.com/https://raw.githubusercontent.com/{owner}/{repo}/{branch}/<文件路径>` |
| 国内实测可达，实时回源 raw（gh-proxy 的备用同类服务） | `https://ghproxy.net/https://raw.githubusercontent.com/{owner}/{repo}/{branch}/<文件路径>` |
| 国内实测可达，走 CDN 有缓存延迟，适合规则稳定后使用 | `https://cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/<文件路径>` |
| 同上，jsDelivr 备用节点 | `https://gcore.jsdelivr.net/gh/{owner}/{repo}@{branch}/<文件路径>` |
| GitHub 官方主源，海外或已翻墙设备首选；不在中国大陆直连（大陆访问被阻断） | `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/<文件路径>` |

把模板里的 `<文件路径>` 换成上表的文件路径即可（例如 `dist/v2ray-rules.json`）。首选 URL 是「国内实测可达」中的第一个；若某个镜像拉取失败或内容陈旧，换表中的另一行重试即可。`dist/urls.json` 里有机器可读的完整 URL 列表。

## 当前规则

| 规则 id | 说明 | 出口标签 | 状态 | 域名条数 | IP 条数 |
| --- | --- | --- | --- | --- | --- |
| 规则 id | 说明 | 出口标签 | 状态 | 域名条数 | IP 条数 |
| --- | --- | --- | --- | --- | --- |
| lan-direct | 局域网与私网直连 | `direct` | 启用 | 1 | 1 |
| cn-dns-direct | 中国大陆公共 DNS 直连 | `direct` | 启用 | 0 | 6 |
| ads-block | 广告与追踪域名阻断 | `block` | 启用 | 1 | 0 |
| ai-proxy | AI 服务走代理 | `proxy` | 启用 | 8 | 0 |
| github-proxy | GitHub 相关走代理 | `proxy` | 启用 | 6 | 0 |
| telegram-proxy | Telegram 走代理 | `proxy` | 启用 | 4 | 14 |

出口标签含义：`proxy` 走代理、`direct` 直连、`block` 阻断（三者都是 v2rayN / v2rayNG 的内置出口）。

---

## v2rayN（Windows / Linux / macOS）

1. 主界面菜单「路由」打开**路由设置**窗口。
2. 双击你要使用的规则集条目（或先「添加规则集」新建一个），进入**规则集设置**窗口。
3. 在窗口顶部「可选地址 (Url)」里粘贴 `dist/v2ray-rules.json` 的主源或镜像地址。
4. 菜单「导入规则」→「从订阅 Url 中导入规则」。
5. 弹出「是否追加规则？选择"是"则追加，选择"否"则全部替换。」
   - 选**是**：追加到当前规则集末尾（保留你原有的基础分流）→ 推荐。
   - 选**否**：整个规则集被本文件替换。
6. **关键一步**：规则按顺序匹配，命中即停止。新导入的规则在列表末尾，会被前面的直连/兜底规则抢先命中，所以请选中这组新规则，用排序按钮把它们移到需要的位置（一般是移到「国内直连」「GeoIP 直连」之前）。
7. 回到路由设置窗口，确认该规则集是「设为活动规则」的状态，保存退出。

提示：`DomainStrategy` 建议保持 v2rayN 默认值；本规则集同时含域名与 IP 匹配，若你把它设成 `AsIs`，IP 规则不会生效。

## v2rayNG（Android）

v2rayNG 目前**不支持**从 URL 订阅路由规则，只能剪贴板/二维码导入：

1. 手机浏览器打开 `dist/v2ray-rules.json` 的主源或镜像地址，全选复制全文（JSON 内容）。
2. v2rayNG → 设置 → **路由设置** → 右上角 ⋮ → 「从剪贴板导入规则集」。
3. 导入会保留被锁定的规则，把新规则追加到列表末尾。
4. 同样需要**长按拖动**把新规则排到直连/GeoIP 规则之前。

规则变动频繁时更省事的做法：用 `dist/xray-client-config.json` 作为「自定义配置」的一次性模板，规则集中在配置里，不依赖 App 的规则列表排序。

## 完整 Xray 配置（任何支持 Xray 内核的客户端/设备）

`dist/xray-client-config.json` 是一份可直接启动的 Xray 客户端配置：socks `127.0.0.1:10808`、http `127.0.0.1:10809`，`proxy` 出口是**占位节点**（`REPLACE_WITH_SERVER_HOST` / `REPLACE_WITH_SNI` / 全 0 UUID），导入后必须替换成你自己的服务器参数，或整段替换成你惯用的协议配置（trojan / vmess / shadowsocks 等）。

- v2rayN：配置 → 添加 → 「自定义配置配置文件」→ 粘贴该文件内容 → 在「Socks 端口」填 `10808` → 启动。
- 其他客户端 / Xray 原生部署：直接使用该 JSON，注意 `geoip.dat` `geosite.dat` 需存在（默认从 Xray 资产目录读取）。

包含基础国内外分流：是（已内置通用 GeoIP/GeoSite 国内外分流作为兜底）

只想把增量规则合并进已有配置时，用 `dist/xray-routing-increment.json`（含 `domainStrategy` 与 `rules`），把其中的规则插到你现有配置 `routing.rules` 的靠前位置。

## 不适用 / 注意事项

- **iOS 上的 Shadowrocket、Stash 等 Clash 系客户端不适用**：本仓库产物是 v2ray/Xray 规则对象，不是 Clash 的 `rule-providers` 格式。iOS 端如需要，另加一份 sing-box `rule_set` 或 Clash 规则集产物。
- 本文件是**增量**规则集，不含兜底规则；不要指望它能独立完成全部分流。
- 中国大陆网络下 `raw.githubusercontent.com` 直连被阻断，请用上表中的国内可达镜像；镜像都是第三方服务，失效时换一行即可。
- 若某条规则需要走另外的出口（例如指定落地节点），把 `rules/source.json` 里的 `outboundTag` 改成你在配置中实际存在的 tag，否则客户端会回退到默认代理出口。
