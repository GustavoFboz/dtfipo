import type * as THREE_NS from "three";

export type ToolId = "none" | "pen" | "rect" | "circle" | "arrow" | "comment" | "eraser";

export type StrokeAnnotation = {
  id: string;
  type: "stroke";
  color: string;
  width: number;
  /** pontos em world-space (== local do mesh, que é estático) */
  points: THREE_NS.Vector3[];
};

export type ShapeAnnotation = {
  id: string;
  type: "rect" | "circle" | "arrow";
  color: string;
  width: number;
  a: THREE_NS.Vector3;
  b: THREE_NS.Vector3;
};

export type CommentAnnotation = {
  id: string;
  type: "comment";
  color: string;
  text: string;
  anchor: THREE_NS.Vector3;
};

export type Annotation = StrokeAnnotation | ShapeAnnotation | CommentAnnotation;

export const TOOL_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#1f6bff", "#a855f7", "#111827", "#ffffff"];
