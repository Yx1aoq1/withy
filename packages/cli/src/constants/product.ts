// Product/runtime constants now live in @tuteur/core (single source). This shim
// keeps existing CLI import sites stable.
export {
  PRODUCT_DISPLAY_NAME,
  PRODUCT_SLUG,
  CLI_COMMAND_NAME,
  PROJECT_DIR_NAME,
  SKILL_NAME_PREFIX,
  DASHBOARD_PROJECT_ROOT_ENV,
  DASHBOARD_SERVICE_NAME,
  DASHBOARD_PACKAGE_NAME,
  getBundledSkillName,
  getSlashCommandPrefix,
  toDirectoryName,
} from '@tuteur/core';
