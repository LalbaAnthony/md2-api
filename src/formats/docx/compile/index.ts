import { hashJson } from "../../../lib/hash.ts";
import { computeContentWidth, tintForBackground } from "../../../theme/tokens.ts";
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
  DocxCalloutSettings,
  DocxFigureSettings,
  DocxQuoteSettings,
  DocxTableOfContentsSettings,
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

const figureSettingsOf = (theme: Theme): DocxFigureSettings => ({
  align: theme.figure.align,
  maxWidthRatio: theme.figure.maxWidthRatio,
});

const calloutSettingsOf = (theme: Theme): DocxCalloutSettings => ({
  padding: theme.callout.padding,
  barWidth: theme.callout.barWidth,
  showLabel: theme.callout.showLabel,
  titleBold: theme.callout.titleBold,
  tintedBackground: theme.callout.tintedBackground,
  variants: {
    info: {
      label: theme.callout.labels.info,
      color: theme.color.callout.info,
      tint: tintForBackground(theme.color.callout.info),
    },
    warning: {
      label: theme.callout.labels.warning,
      color: theme.color.callout.warning,
      tint: tintForBackground(theme.color.callout.warning),
    },
    danger: {
      label: theme.callout.labels.danger,
      color: theme.color.callout.danger,
      tint: tintForBackground(theme.color.callout.danger),
    },
    success: {
      label: theme.callout.labels.success,
      color: theme.color.callout.success,
      tint: tintForBackground(theme.color.callout.success),
    },
    note: {
      label: theme.callout.labels.note,
      color: theme.color.callout.note,
      tint: tintForBackground(theme.color.callout.note),
    },
  },
});

const quoteSettingsOf = (theme: Theme): DocxQuoteSettings => ({
  indentLeft: theme.quote.indentLeft,
  indentRight: theme.quote.indentRight,
});

const tableOfContentsSettingsOf = (theme: Theme): DocxTableOfContentsSettings => ({
  enabled: theme.tableOfContents.enabled,
  title: theme.tableOfContents.title,
  depth: theme.tableOfContents.depth,
  hyperlinks: theme.tableOfContents.hyperlinks,
  pageBreakAfter: theme.tableOfContents.pageBreakAfter,
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
    figure: figureSettingsOf(theme),
    callout: calloutSettingsOf(theme),
    quote: quoteSettingsOf(theme),
    tableOfContents: tableOfContentsSettingsOf(theme),
    extension,
  };
};
