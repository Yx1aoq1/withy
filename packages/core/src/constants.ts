// Canonical product/runtime constants. The CLI re-exports these via its own
// constants/product.ts shim so existing CLI import sites keep working.

export const PRODUCT_DISPLAY_NAME = 'Withy';
export const PRODUCT_SLUG = toDirectoryName(PRODUCT_DISPLAY_NAME);
export const CLI_COMMAND_NAME = 'withy';
export const PROJECT_DIR_NAME = `.${PRODUCT_SLUG}`;
export const GLOBAL_DIR_NAME = `.${PRODUCT_SLUG}`;
export const SKILL_NAME_PREFIX = PRODUCT_SLUG;

export const DASHBOARD_PROJECT_ROOT_ENV = `${toEnvName(PRODUCT_SLUG)}_PROJECT_ROOT`;
export const DASHBOARD_SERVICE_NAME = `${PRODUCT_SLUG}-dashboard`;
export const DASHBOARD_PACKAGE_NAME = `@${PRODUCT_SLUG}/app`;

/** Fixed macro-phase ids (the three workflow containers). */
export const PHASE_PLANNING = 'planning';
export const PHASE_EXECUTE = 'execute';
export const PHASE_FINISH = 'finish';

/** Default consecutive-failure threshold for the "stuck" alarm (overridable by config.yaml). */
export const DEFAULT_STUCK_THRESHOLD = 3;

/** Max length a stored event `reason` is truncated to (compact JSONL lines). */
export const EVENT_REASON_MAX = 200;

/** Bundled skill name for a workflow base name, e.g. `dev` → `withy-dev`. */
export function getBundledSkillName(baseName: string): string {
  return `${SKILL_NAME_PREFIX}-${toDirectoryName(baseName)}`;
}

/** Slash-command prefix used by Claude/Gemini skill invocation, e.g. `/withy:`. */
export function getSlashCommandPrefix(): string {
  return `/${PRODUCT_SLUG}:`;
}

export function toDirectoryName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function toEnvName(value: string): string {
  return toDirectoryName(value).replace(/-/g, '_').toUpperCase();
}
