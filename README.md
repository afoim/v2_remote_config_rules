# v2_remote_config_rules

把「特定域名走哪个出口」的路由规则托管在 GitHub 上，任意设备的 Xray / v2rayN / v2rayNG 客户端只填一个 URL 就能订阅、更新。

**定位：增量规则集。** 国内外基础分流仍由客户端自己的 GeoIP/GeoSite（或你已有的配置）负责，本仓库只做叠加与修正——强制某些域名走代理、直连或阻断。

## 产物

| 文件 | 用途 |
| --- | --- |
| `dist/v2ray-rules.json` | v2rayN「从订阅 Url 中导入规则」；v2rayNG 剪贴板/二维码导入 |
| `dist/xray-client-config.json` | 完整可启动的 Xray 客户端配置（占位节点 + 路由规则） |
| `dist/xray-routing-increment.json` | 只含增量规则的 `routing` 片段，手工合并进已有配置 |
| `dist/urls.json` | 各产物在主源与各镜像上的 URL（机器可读） |
| `docs/IMPORT.md` | 自动生成的按客户端导入步骤与规则清单 |

逐客户端的导入步骤见 **[docs/IMPORT.md](docs/IMPORT.md)**。

## 目录

```
repo.config.json              发布坐标（owner/repo/branch）、镜像模板、includeBaseSplit
rules/source.json             唯一规则源：域名/IP → 出口标签（改这里）
rules/base-split.json         完整配置内置的通用国内外分流（可关）
scripts/build.mjs             生成 dist/ 与 docs/IMPORT.md
scripts/validate.mjs          结构校验 + dist 与源同步校验
docs/IMPORT.template.md      导入说明模板（占位符由 build 填充）
```

## 快速开始

1. 改 `repo.config.json` 的 `owner`（已预填 `afoim`）、`repo`、`branch`。
2. 在 `rules/source.json` 里增删规则：每条规则是 `remarks` + `outboundTag` + `domain`/`ip`，一条源规则若同时含 domain 与 ip，导出时会拆成两条（与客户端内部行为一致）。
3. `npm run build` 生成 `dist/` 与 `docs/IMPORT.md`。
4. `npm run check` 校验，然后提交推送。客户端填 `docs/IMPORT.md` 里的 URL 即可导入。

## 规则写法

`domain` 项必须是显式前缀，避免误用子串匹配：

- `domain:example.com` — 命中 example.com 及其子域名（最常用）
- `full:example.com` — 只命中完全相等
- `keyword:example` / `regexp:^ad\..*\.com$` — 子串 / 正则
- `geosite:cn`、`geosite:category-ads-all`、`ext:custom.dat:tag` — 引用 geo 数据
- `ip` 项支持 IPv4/IPv6/CIDR 与 `geoip:cn`、`geoip:private`

裸字符串（如 `example.com`）在 Xray 中是**子串匹配**，会被校验器拦下并提示改写。

`outboundTag` 默认用 `proxy` / `direct` / `block`（v2rayN、v2rayNG 的内置出口标签）。要用自定义出口（例如指定落地节点），标签需与客户端配置里真实存在的 outbound 一致，否则回退到默认代理。

## 校验与同步

- `npm run check` 校验：字段白名单、出口标签合法性、域名/IP 语法、跨规则出口冲突、重复项、**禁止兜底规则**（保证不会覆盖客户端自带分流）、生成产物结构、`dist/` 是否与源同步。
- CI（`.github/workflows/ci.yml`）在每次 push 上跑同一套校验，并下载官方 Xray 内核执行 `xray run -test -c dist/xray-client-config.json`，确保发布出去的完整配置能被真实内核解析。

## 分发与镜像

客户端拉取的是**已提交的静态文件**，所以 `dist/` 必须跟着源一起提交，CI 会校验两者同步。

实测（2026-09，中国大陆网络）：

| 地址 | 结果 |
| --- | --- |
| `raw.githubusercontent.com` | 域名可解析，TCP 直连立即失败（被阻断） |
| `gh-proxy.com` / `ghproxy.net` | 可达，实时回源 raw，无缓存；第三方服务 |
| `cdn.jsdelivr.net` / `gcore.jsdelivr.net` | 可达，有 CDN 缓存延迟 |
| `ghfast.top` | 超时，已从镜像列表移除 |

因此 `docs/IMPORT.md` 里的首选 URL 指向 `gh-proxy.com`，海外设备可改用 raw 主源。镜像都是第三方，失效时换一行重试即可；客户端拉取失败会保留上一次的规则，不会清空。

## 边界

- 只在 macOS/Linux/Windows 上验证过数据与 Xray 解析，客户端 UI 步骤以 v2rayN 7.x、v2rayNG 1.10+ 为准。
- v2rayNG 只支持剪贴板/二维码导入规则，URL 订阅规则是 v2rayN 桌面端独有；Android 想彻底省掉手工排序，用 `dist/xray-client-config.json` 走「自定义配置」。
- Clash / sing-box 系客户端（含 iOS 的 Shadowrocket、Stash）需要各自的规则集格式，本仓库不产出。
