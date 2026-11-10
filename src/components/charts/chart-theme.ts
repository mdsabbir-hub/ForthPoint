export const CHART_COLORS = ["#3FB27F", "#6C8EBF", "#D9A441", "#B58AD6", "#D4605A"];
export const AXIS_COLOR = "#8A97AD";
export const GRID_COLOR = "#24324D";

export interface SeriesDef { key: string; label: string; color?: string }
export interface ChartProps {
  data: Array<Record<string, number | string | null>>;
  series: SeriesDef[];
  /** Label shown in tooltips, e.g. "BDT mn" or "%". */
  unitLabel: string;
  format: (n: number) => string;
  height?: number;
}
