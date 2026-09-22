import { hashJson } from "../../../lib/hash.ts";
import { computeContentWidth } from "../../../theme/tokens.ts";
import { parseDocxThemeExtension } from "../theme-extension.ts";
import { compileNumbering, headingsAreNumbered, numberingReferences } from "./numbering.ts";
import { compileSection } from "./section.ts";
import { compileSyntaxRuns } from "./syntax-theme.ts";
import { buildStyleIds, compileStyles } from "./styles.ts";
import type { Theme } from "../../../types/theme.ts";
import type {
  DocxCaptionSettings,
  DocxCodeSettings,
  DocxCompiledTheme,
  DocxFontNames,
  DocxListSettings,
  DocxParagraphBehaviour,
  DocxTableSettings,
} from "../../../types/docx-theme.ts";

const paragraphBehaviourOf = (theme: Theme): DocxParagraphBehaviour => ({
  widowControl: theme.paragraph.widowControl,
  headingPageBreakBefore: [
    theme.heading[0].pageBreakBefore,
    theme.heading[1].pageBreakBefore,
    theme.heading[2].pageBreakBefore,
    theme.heading[3].pageBreakBefore,
    theme.heading[4].pageBreakBefore,
    theme.heading[5].pageBreakBefore,
  ],
});

const fontNamesOf = (theme: Theme): DocxFontNames => ({
  body: theme.type.body.name,
  heading: theme.type.heading.name,
  mono: theme.type.mono.name,
});

const listSettingsOf = (theme: Theme): DocxListSettings => ({
  indentStep: theme.list.indentStep,
  hanging: theme.list.hanging,
  taskGlyphs: {
    checked: theme.list.taskGlyphs.checked,
    unchecked: theme.list.taskGlyphs.unchecked,
  },
});

const codeSettingsOf = (theme: Theme): DocxCodeSettings => ({
  background: theme.color.codeBackground,
  border: theme.color.codeBorder,
  borderWidth: theme.table.borderWidth,
  padding: theme.code.padding,
  showLineNumbers: theme.code.showLineNumbers,
  showLanguageLabel: theme.code.showLanguageLabel,
  fontSize: theme.code.fontSize,
});

const tableSettingsOf = (theme: Theme): DocxTableSettings => ({
  headerBackground: theme.color.tableHeaderBackground,
  stripeBackground: theme.color.tableStripe ?? theme.color.tableHeaderBackground,
  stripes: theme.table.stripes && theme.color.tableStripe !== null,
  repeatHeaderRow: theme.table.repeatHeaderRow,
  borderColor: theme.color.tableBorder,
  borderWidth: theme.table.borderWidth,
  borderStyle: theme.table.borderStyle,
  horizontalRulesOnly: theme.table.horizontalRulesOnly,
  cellPaddingX: theme.table.cellPaddingX,
  cellPaddingY: theme.table.cellPaddingY,
  align: theme.table.align,
});

const captionSettingsOf = (theme: Theme): DocxCaptionSettings => ({
  position: theme.caption.position,
  figurePrefix: theme.caption.figurePrefix,
  tablePrefix: theme.caption.tablePrefix,
  separator: theme.caption.separator,
  align: theme.caption.align,
});

export const compileThemeForDocx = (theme: Theme): DocxCompiledTheme => {
  const extension = parseDocxThemeExtension(theme.formats["docx"] ?? {});
  const styleIds = buildStyleIds(extension.styleIdPrefix);
  return {
    themeId: theme.id,
    themeHash: hashJson(theme),
    styles: compileStyles(theme, styleIds),
    numbering: compileNumbering(theme),
    section: compileSection(theme),
    contentWidth: computeContentWidth(theme),
    styleIds,
    numberingReferences,
    headingsAreNumbered: headingsAreNumbered(theme),
    paragraphBehaviour: paragraphBehaviourOf(theme),
    fonts: fontNamesOf(theme),
    list: listSettingsOf(theme),
    code: codeSettingsOf(theme),
    syntax: compileSyntaxRuns(theme),
    table: tableSettingsOf(theme),
    caption: captionSettingsOf(theme),
    extension,
  };
};
