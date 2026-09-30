#!/usr/bin/env node
// 校验 rules/ 源数据、生成产物结构与 dist 是否与源同步。
// 用法：node scripts/validate.mjs [--check-dist]
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const SOURCE_KEYS = new Set(['id', 'remarks', 'outboundTag', 'enabled', 'domain', 'ip', 'port', 'network', 'protocol']);
const RULE_OUT_KEYS = new Set(['remarks', 'outboundTag', 'enabled', 'domain', 'ip', 'port', 'network', 'protocol']);
const OUTBOUND_TAG_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const GEOSITE_TAG_RE = /^[A-Za-z0-9!_.-]+$/;

const isIPv4 = (s) => /^(\d{1,3}\.){3}\d{1,3}$/.test(s) && s.split('.').every((o) => +o <= 255);
const isIPv6 = (s) => /^[0-9a-f:]+$/i.test(s) && s.includes(':') && s.length <= 45;
const isCidr = (s) => {
  const [addr, len, ...rest] = s.split('/');
  if (rest.length || len === undefined || !/^\d{1,3}$/.test(len)) return false;
  const bits = +len;
  return isIPv4(addr) ? bits <= 32 : isIPv6(addr) && bits <= 128;
};
const isIp = (s) => isIPv4(s) || isIPv6(s) || isCidr(s);

function checkDomainToken(token, where) {
  if (typeof token !== 'string' || !token.length) return fail(`${where}: 域名项必须是非空字符串`);
  if (/^https?:\/\//i.test(token) || token.includes('/')) return fail(`${where}: "${token}" 不能包含协议或路径，去掉 http:// 与 /`);
  if (token.includes('*')) return fail(`${where}: "${token}" 不支持通配符 *，请用 domain:/full:/keyword: 语法`);
  if (/[^\x20-\x7f]/.test(token)) return fail(`${where}: "${token}" 含非 ASCII 字符，请改用 punycode（xn--…）`);
  if (/[A-Z]/.test(token)) return fail(`${where}: "${token}" 请使用小写（匹配行为依赖规范化后的域名）`);

  const m = token.match(/^(geosite|ext):(.+)$/);
  if (m) {
    const parts = m[2].split(':');
    return parts.every((p) => GEOSITE_TAG_RE.test(p)) ? null : fail(`${where}: "${token}" 的 ${m[1]} 标签非法`);
  }
  if (token.startsWith('regexp:')) {
    try {
      new RegExp(token.slice(7));
      return null;
    } catch (e) {
      return fail(`${where}: "${token}" 正则非法：${e.message}`);
    }
  }
  if (token.startsWith('keyword:')) return token.length > 8 ? null : fail(`${where}: "${token}" keyword 不能为空`);
  if (token.startsWith('domain:') || token.startsWith('full:')) {
    const host = token.slice(token.indexOf(':') + 1);
    return HOSTNAME_RE.test(host) ? null : fail(`${where}: "${token}" 不是合法域名`);
  }
  if (isIp(token)) return warn(`${where}: "${token}" 是 IP，建议放进 ip 字段以获得更好的匹配语义`);
  return fail(`${where}: "${token}" 缺少匹配前缀；裸字符串在 Xray 中是子串匹配，请改用 domain:${token} / full:${token} / keyword:${token}`);
}

function checkSource(source) {
  if (!Array.isArray(source.rules) || !source.rules.length) return fail('rules/source.json: rules 必须是非空数组');
  if (source.strategy !== 'increment') warn('rules/source.json: strategy 不是 increment，请确认这是增量规则集');
  const ids = new Set();
  const domainOwner = new Map();
  for (const [i, r] of source.rules.entries()) {
    const where = `rules[${i}]${r.id ? ` (${r.id})` : ''}`;
    for (const k of Object.keys(r)) if (!SOURCE_KEYS.has(k)) fail(`${where}: 未知字段 ${k}`);
    if (!r.id || typeof r.id !== 'string') fail(`${where}: 缺少 id`);
    else if (ids.has(r.id)) fail(`${where}: id 重复`);
    else ids.add(r.id);
    if (!r.remarks) fail(`${where}: 缺少 remarks（客户端里靠它识别规则）`);
    if (!OUTBOUND_TAG_RE.test(r.outboundTag ?? '')) fail(`${where}: outboundTag "${r.outboundTag}" 非法，应为小写字母数字-_ 组成的标签`);
    if (r.enabled !== undefined && typeof r.enabled !== 'boolean') fail(`${where}: enabled 必须是布尔值`);
    if (r.domain && !Array.isArray(r.domain)) fail(`${where}: domain 必须是数组`);
    if (r.ip && !Array.isArray(r.ip)) fail(`${where}: ip 必须是数组`);
    const domain = r.domain ?? [];
    const ip = r.ip ?? [];
    const rest = ['port', 'network', 'protocol'].filter((k) => r[k] !== undefined);
    if (!domain.length && !ip.length && !rest.length) fail(`${where}: 增量规则必须有 domain/ip/port/network/protocol 之一，不允许无条件兜底规则`);
    if (!domain.length && !ip.length && rest.length && r.port === '0-65535') fail(`${where}: "0-65535" 端口等价于兜底规则，增量规则集不允许`);

    if (new Set(domain).size !== domain.length) fail(`${where}: domain 存在重复项`);
    if (new Set(ip).size !== ip.length) fail(`${where}: ip 存在重复项`);
    for (const d of domain) {
      checkDomainToken(d, `${where}.domain`);
      const prev = domainOwner.get(d);
      if (prev && prev.tag !== r.outboundTag) fail(`${where}: 域名 "${d}" 已在规则 ${prev.id} 中指向 ${prev.tag}，出口冲突`);
      else domainOwner.set(d, { id: r.id, tag: r.outboundTag });
    }
    for (const x of ip) {
      const m = x.match(/^geoip:(.+)$/);
      if (!m && !isIp(x)) fail(`${where}.ip: "${x}" 既不是 IP/CIDR 也不是 geoip: 标签`);
      if (m && !GEOSITE_TAG_RE.test(m[1])) fail(`${where}.ip: "${x}" 的 geoip 标签非法`);
    }
    if (r.network && !/^(tcp|udp|tcp,udp)$/.test(r.network)) fail(`${where}: network "${r.network}" 非法`);
    if (r.port && !/^(\d{1,5}(-\d{1,5})?)(,\d{1,5}(-\d{1,5})?)*$/.test(r.port)) fail(`${where}: port "${r.port}" 非法`);
    if (r.protocol && !Array.isArray(r.protocol)) fail(`${where}: protocol 必须是数组`);
  }
}

function checkRulesArtifact(rules) {
  if (!Array.isArray(rules) || !rules.length) return fail('dist/v2ray-rules.json: 必须是非空数组');
  for (const [i, r] of rules.entries()) {
    for (const k of Object.keys(r)) if (!RULE_OUT_KEYS.has(k)) fail(`dist/v2ray-rules.json[${i}]: 含客户端不识别的字段 ${k}`);
    if (!r.remarks || !r.outboundTag) fail(`dist/v2ray-rules.json[${i}]: 缺少 remarks/outboundTag`);
    if (!r.domain && !r.ip && !r.port && !r.network && !r.protocol) fail(`dist/v2ray-rules.json[${i}]: 该规则没有任何匹配条件`);
  }
}

function checkClientConfig(cfg) {
  const tags = new Set((cfg.outbounds ?? []).map((o) => o.tag));
  for (const need of ['proxy', 'direct', 'block']) if (!tags.has(need)) fail(`dist/xray-client-config.json: 缺少 tag 为 ${need} 的 outbound`);
  const rules = cfg.routing?.rules ?? [];
  if (!rules.length) fail('dist/xray-client-config.json: routing.rules 为空');
  for (const [i, r] of rules.entries()) {
    if (r.type !== 'field') fail(`dist/xray-client-config.json: routing.rules[${i}] 的 type 必须是 field`);
    if (!tags.has(r.outboundTag)) fail(`dist/xray-client-config.json: routing.rules[${i}] 指向不存在的 outbound "${r.outboundTag}"`);
    for (const k of ['domain', 'ip', 'port', 'network', 'protocol']) {
      if (k in r && !r[k]) fail(`dist/xray-client-config.json: routing.rules[${i}].${k} 为空`);
    }
    if (r.outboundTag !== 'proxy' && !r.domain && !r.ip) warn(`dist/xray-client-config.json: routing.rules[${i}] 是无条件规则（兜底）`);
  }
  for (const o of cfg.outbounds ?? []) {
    if (o.tag === 'proxy' && JSON.stringify(o).includes('REPLACE_WITH')) warn('dist/xray-client-config.json: proxy 占位节点未替换，导入后必须先填服务器信息');
  }
  const ports = (cfg.inbounds ?? []).map((n) => n.port);
  if (new Set(ports).size !== ports.length) fail('dist/xray-client-config.json: inbound 端口重复');
}

function checkRepoConfig(repo) {
  for (const k of ['owner', 'repo', 'branch']) if (!repo[k]) fail(`repo.config.json: 缺少 ${k}`);
  if (!Array.isArray(repo.mirrors) || !repo.mirrors.length) fail('repo.config.json: mirrors 不能为空');
  for (const m of repo.mirrors ?? []) {
    if (!m.url || !m.note) fail('repo.config.json: mirrors 每项都需要 url 与 note');
    for (const ph of ['{owner}', '{repo}', '{branch}', '{path}']) if (!(m.url ?? '').includes(ph)) fail(`repo.config.json: 镜像模板 ${m.url} 缺少 ${ph}`);
  }
  if (typeof repo.includeBaseSplit !== 'boolean') fail('repo.config.json: includeBaseSplit 必须是布尔值');
}

function main() {
  const repo = readJson('repo.config.json');
  const source = readJson('rules/source.json');
  checkRepoConfig(repo);
  checkSource(source);

  const files = build();
  for (const path of Object.keys(files)) if (!existsSync(join(ROOT, path))) fail(`缺少产物 ${path}，请运行 npm run build`);

  checkRulesArtifact(JSON.parse(files['dist/v2ray-rules.json']));
  checkClientConfig(JSON.parse(files['dist/xray-client-config.json']));
  JSON.parse(files['dist/xray-routing-increment.json']);
  JSON.parse(files['dist/urls.json']);

  if (process.argv.includes('--check-dist')) {
    for (const [path, content] of Object.entries(files)) {
      if (!existsSync(join(ROOT, path))) continue;
      if (readFileSync(join(ROOT, path), 'utf8') !== content) fail(`${path} 与源数据不同步，请运行 npm run build 并提交结果`);
    }
  }

  for (const w of warnings) console.warn(`warn  ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`error ${e}`);
    console.error(`\n${errors.length} 个错误`);
    process.exit(1);
  }
  console.log(`ok  ${source.rules.length} 条源规则，${JSON.parse(files['dist/v2ray-rules.json']).length} 条导出规则${warnings.length ? `，${warnings.length} 个警告` : ''}`);
}

main();
