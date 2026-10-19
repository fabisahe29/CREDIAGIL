// Lista única de lo que viaja en el plugin: cada fuente de este repositorio y su destino.

export type ClasePieza = "hook" | "control" | "subagente" | "skill";

export interface Pieza {
  /** Ruta relativa a la raíz del repositorio, con `/`. */
  fuente: string;
  /** Ruta relativa a la carpeta del plugin, con `/`. */
  destino: string;
  clase: ClasePieza;
}

/** Carpeta del plugin, relativa a la raíz del repositorio. */
export const CARPETA_PLUGIN = "plugins/crediagil-controles";

export const PIEZAS: readonly Pieza[] = [
  { fuente: ".claude/hooks/guardian-base.ts", destino: "hooks/guardian-base.ts", clase: "hook" },
  {
    fuente: ".claude/hooks/guardian-controles.ts",
    destino: "hooks/guardian-controles.ts",
    clase: "hook",
  },
  { fuente: ".claude/hooks/lib/accion.ts", destino: "hooks/lib/accion.ts", clase: "control" },
  { fuente: ".claude/hooks/lib/bloqueo.ts", destino: "hooks/lib/bloqueo.ts", clase: "control" },
  { fuente: ".claude/hooks/lib/shell.ts", destino: "hooks/lib/shell.ts", clase: "control" },
  { fuente: ".claude/hooks/lib/secretos.ts", destino: "hooks/lib/secretos.ts", clase: "control" },
  {
    fuente: ".claude/hooks/lib/datos-reales.ts",
    destino: "hooks/lib/datos-reales.ts",
    clase: "control",
  },
  {
    fuente: ".claude/hooks/lib/convencion-ficticia.ts",
    destino: "hooks/lib/convencion-ficticia.ts",
    clase: "control",
  },
  { fuente: ".claude/hooks/lib/revisores.ts", destino: "hooks/lib/revisores.ts", clase: "control" },
  {
    fuente: ".claude/hooks/lib/config-equipo.ts",
    destino: "hooks/lib/config-equipo.ts",
    clase: "control",
  },
  {
    fuente: ".claude/agents/revisor-reglas.md",
    destino: "agents/revisor-reglas.md",
    clase: "subagente",
  },
  {
    fuente: ".claude/skills/revisar-reglas/SKILL.md",
    destino: "skills/revisar-reglas/SKILL.md",
    clase: "skill",
  },
];

/** Prefijos de ruta que nunca viajan: lo propio del flujo de tickets y de originación. */
export const EXCLUSIONES: readonly string[] = [
  ".claude/hooks/lib/spec-primero",
  ".claude/hooks/lib/puerta-pr",
  ".claude/hooks/formatear",
  ".claude/revision/",
  ".claude/agents/revisor-codigo",
  ".claude/agents/revisor-cumplimiento",
  ".claude/skills/revisar-codigo",
  ".claude/skills/revisar-cumplimiento",
  ".claude/skills/ticket-",
  ".claude/skills/speckit-",
  "src/",
];
