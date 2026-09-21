import { PageOrientation } from "docx";
import type { ISectionPropertiesOptions } from "docx";
import type { Theme } from "../../../types/theme.ts";

export const compileSection = (theme: Theme): ISectionPropertiesOptions => ({
  page: {
    size: {
      width: theme.page.size.width,
      height: theme.page.size.height,
      orientation:
        theme.page.orientation === "landscape"
          ? PageOrientation.LANDSCAPE
          : PageOrientation.PORTRAIT,
    },
    margin: {
      top: theme.page.margin.top,
      right: theme.page.margin.right,
      bottom: theme.page.margin.bottom,
      left: theme.page.margin.left,
      header: theme.page.margin.header,
      footer: theme.page.margin.footer,
      gutter: theme.page.margin.gutter,
    },
  },
  ...(theme.page.columns === null
    ? {}
    : {
        column: {
          count: theme.page.columns.count,
          space: theme.page.columns.space,
          separate: theme.page.columns.separator,
        },
      }),
});
