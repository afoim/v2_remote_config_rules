#!/usr/bin/env node
// 从 rules/ 生成 dist/ 下的公开产物与 docs/IMPORT.md。
// 产物：
//   dist/v2ray-rules.json             v2rayN「从订阅 URL 导入规则」/ v2rayNG 剪贴板、二维码
//   dist/xray-client-config.json      完整 Xray 客户端配置（含占位节点）
//   dist/xray-routing-increment.json  只含增量规则的 routing 片段
//   dist/urls.json                    各产物在各镜像上的可访问 URL
//   docs/IMPORT.md                    按客户端生成的导入说明
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

export const SORT_KEYS = ['remarks', 'outboundTag', 'enabled', 'domain', 'ip', 'port', 'network', 'protocol'];

/** 增量规则：一条源规则可能同时含 domain 与 ip，拆成两条独立规则（与 v2rayN/v2rayNG 内部行为一致）。 */
export function expandRules(sourceRules) {
  const out = [];
  for (const r of sourceRules) {
    if (r.enabled === false) continue;
    const rest = {};
    for (const k of ['port', 'network', 'protocol']) if (r[k] !== undefined) rest[k] = r[k];
    const domain = r.domain ?? [];
    const ip = r.ip ?? [];
    if (domain.length) out.push({ remarks: r.remarks, outboundTag: r.outboundTag, enabled: true, domain, ...rest });
    if (ip.length) {
      const remarks = domain.length ? `${r.remarks} (IP)` : r.remarks;
      out.push({ remarks, outboundTag: r.outboundTag, enabled: true, ip, ...rest });
    }
    if (!domain.length && !ip.length) {
      if (!Object.keys(rest).length) throw new Error(`规则 ${r.id} 没有任何匹配条件（增量规则不允许兜底规则）`);
      out.push({ remarks: r.remarks, outboundTag: r.outboundTag, enabled: true, ...rest });
    }
  }
  return out;
}

const toXrayRule = (r) => {
  const rule = { type: 'field' };
  for (const k of ['port', 'network', 'protocol', 'domain', 'ip']) if (r[k] !== undefined) rule[k] = r[k];
  rule.outboundTag = r.outboundTag;
  return rule;
};

function buildXrayConfig(sourceRules, baseSplit, includeBaseSplit) {
  const rules = expandRules(sourceRules).map(toXrayRule);
  if (includeBaseSplit) rules.push(...baseSplit.rules);
  return {
    log: { loglevel: 'warning', access: 'none', error: '' },
    dns: {
      queryStrategy: 'UseIP',
      servers: [
        { address: '223.5.5.5', domains: ['geosite:cn'] },
        { address: '1.1.1.1', domains: ['geosite:geolocation-!cn'] },
        '8.8.8.8',
      ],
    },
    inbounds: [
      {
        tag: 'socks',
        listen: '127.0.0.1',
        port: 10808,
        protocol: 'socks',
        settings: { auth: 'noauth', udp: true },
        sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'], routeOnly: false },
      },
      {
        tag: 'http',
        listen: '127.0.0.1',
        port: 10809,
        protocol: 'http',
        sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'], routeOnly: false },
      },
    ],
    outbounds: [
      {
        tag: 'proxy',
        protocol: 'vless',
        settings: {
          vnext: [
            {
              address: 'REPLACE_WITH_SERVER_HOST',
              port: 443,
              users: [{ id: '00000000-0000-0000-0000-000000000000', encryption: 'none', flow: 'xtls-rprx-vision' }],
            },
          ],
        },
        streamSettings: {
          network: 'tcp',
          security: 'reality',
          realitySettings: {
            serverName: 'REPLACE_WITH_SNI',
            fingerprint: 'chrome',
            publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            shortId: '',
          },
        },
      },
      { tag: 'direct', protocol: 'freedom', settings: { domainStrategy: 'UseIP' } },
      { tag: 'block', protocol: 'blackhole', settings: {} },
    ],
    routing: { domainStrategy: baseSplit.domainStrategy ?? 'IPIfNonMatch', rules },
  };
}

const renderUrls = (cfg, path) =>
  cfg.mirrors.map((m) => m.url.replace('{owner}', cfg.owner).replace('{repo}', cfg.repo).replace('{branch}', cfg.branch).replace('{path}', path));

function renderImportDocs(cfg, sourceRules) {
  const tpl = readFileSync(join(ROOT, 'docs/IMPORT.template.md'), 'utf8');
  const rows = cfg.artifacts
    .map((a) => `| \`${a.path}\` | ${a.label} | ${a.usage} | \`${renderUrls(cfg, a.path)[0]}\` |`)
    .join('\n');
  const primaryTable = `| 文件 | 用途 | 说明 | 首选 URL |\n| --- | --- | --- | --- |\n${rows}`;
  const mirrorRows = cfg.mirrors
    .map((m) => `| ${m.note} | \`${m.url.replace('{path}', '<文件路径>')}\` |`)
    .join('\n');
  const mirrorTable = `| 可用性 | URL 模板 |\n| --- | --- |\n${mirrorRows}`;
  const ruleRows = sourceRules
    .map((r) => `| ${r.id} | ${r.remarks} | \`${r.outboundTag}\` | ${r.enabled === false ? '关闭' : '启用'} | ${(r.domain ?? []).length} | ${(r.ip ?? []).length} |`)
    .join('\n');
  const ruleTable = `| 规则 id | 说明 | 出口标签 | 状态 | 域名条数 | IP 条数 |\n| --- | --- | --- | --- | --- | --- |\n${ruleRows}`;
  return tpl
    .replaceAll('{{TITLE}}', cfg.title)
    .replaceAll('{{PRIMARY_TABLE}}', primaryTable)
    .replaceAll('{{MIRROR_TABLE}}', mirrorTable)
    .replaceAll('{{RULES_TABLE}}', ruleTable)
    .replaceAll('{{INCLUDE_BASE_SPLIT}}', cfg.includeBaseSplit ? '是（已内置通用 GeoIP/GeoSite 国内外分流作为兜底）' : '否（只含增量规则，未匹配流量交给客户端自身分流）');
}

/** 返回 { 'dist/x.json': '内容', ... }，不落盘；供 --check-dist 与写入共用。 */
export function build() {
  const cfg = readJson('repo.config.json');
  const source = readJson('rules/source.json');
  const baseSplit = readJson('rules/base-split.json');
  const jar = (o) => `${JSON.stringify(o, null, 2)}\n`;

  const rulesJson = expandRules(source.rules);
  const clientConfig = buildXrayConfig(source.rules, baseSplit, cfg.includeBaseSplit);
  const increment = {
    routing: {
      domainStrategy: baseSplit.domainStrategy ?? 'IPIfNonMatch',
      rules: expandRules(source.rules).map(toXrayRule),
    },
  };
  const urls = Object.fromEntries(
    cfg.artifacts.map((a) => {
      const rendered = renderUrls(cfg, a.path);
      return [
        a.path,
        {
          primary: rendered[0],
          mirrors: cfg.mirrors.map((m, i) => ({ note: m.note, url: rendered[i] })),
        },
      ];
    }),
  );

  return {
    'dist/v2ray-rules.json': jar(rulesJson),
    'dist/xray-client-config.json': jar(clientConfig),
    'dist/xray-routing-increment.json': jar(increment),
    'dist/urls.json': jar({ generatedFrom: ['repo.config.json', 'rules/source.json'], artifacts: urls }),
    'docs/IMPORT.md': renderImportDocs(cfg, source.rules),
  };
}

export function writeArtifacts(files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(ROOT, path)), { recursive: true });
    writeFileSync(join(ROOT, path), content);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = build();
  writeArtifacts(files);
  for (const p of Object.keys(files)) console.log(`written ${p}`);
}
