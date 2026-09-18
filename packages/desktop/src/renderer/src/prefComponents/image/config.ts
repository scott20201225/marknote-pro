import { t } from '../../i18n'
import type { PrefSelectOption } from '../common/types'

export const getScreenshotSaveMethods = (): PrefSelectOption<string>[] => [
  {
    label: t('preferences.image.screenshotSaveMethods.attachment'),
    value: 'attachment'
  },
  {
    label: t('preferences.image.screenshotSaveMethods.base64'),
    value: 'base64'
  }
]
