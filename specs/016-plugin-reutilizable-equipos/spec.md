# Feature Specification: Plugin reutilizable para otros equipos

**Feature Branch**: `18-plugin-reutilizable-para-otros-equipos`

**Created**: 2026-10-19

**Status**: Draft

**Issue de origen**: [fabisahe29/CREDIAGIL#18 — Plugin reutilizable para otros equipos](https://github.com/fabisahe29/CREDIAGIL/issues/18)

**Épica / Milestone**: `epica:flujo-y-ecosistema` · M3 · Validación y entrega · **Depende de**: #5 y #6

**Trazabilidad con el enunciado**: Necesidad 11 · Mínimo: plugin

**Input**: Contenido del issue #18, leído del GitHub Project al tomar el ticket.

## Clarifications

### Session 2026-10-19

- Q: ¿Qué piezas de este repositorio viajan en el plugin y cuáles se quedan fuera por ser propias de originación y de este flujo? → A: Viajan los controles genéricos: hook de secretos y de datos con forma real, convención de datos ficticios, solo lectura de los revisores, un subagente revisor de cumplimiento que lee las reglas que declara el equipo y una skill de uso. Se quedan fuera `spec-primero`, `puerta-pr`, los `/ticket-*`, las skills `speckit-*`, la política de crédito y todo `src/`.
- Q: Cuando este repositorio use el plugin, ¿de dónde sale la única copia de cada pieza genérica y qué pasa con la copia que hoy vive en `.claude/`? → A: El repositorio sigue siendo la fuente. El plugin se genera copiando las piezas desde `.claude/` en cada versión, y las pruebas detectan cualquier desalineación entre las dos copias.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Instalar los controles en otro repositorio sin copiar archivos (Priority: P1)

Como integrante de otro equipo de Crediágil, quiero instalar en mi repositorio las piezas reutilizables de este proyecto con una instalación guiada desde un catálogo compartido, sin copiar archivos a mano. Así aplico los mismos controles (datos con forma real, revisión de cumplimiento) sin reconstruirlos.

**Why this priority**: es el propósito del ticket. Si instalar exige copiar archivos, el resto del paquete no sirve.

**Independent Test**: en un repositorio vacío que no es este, registrar el catálogo compartido e instalar el paquete. Comprobar que quedan disponibles el subagente, la skill y el hook, sin haber copiado ningún archivo a mano.

**Acceptance Scenarios**:

1. **Given** un repositorio distinto de este y sin ninguna pieza de Crediágil, **When** el equipo registra el catálogo compartido e instala el paquete, **Then** el subagente, la skill y el hook del paquete quedan disponibles en ese repositorio.
2. **Given** el paquete ya instalado, **When** el equipo lo desinstala, **Then** las piezas dejan de estar disponibles y no quedan archivos del paquete dentro del repositorio.
3. **Given** el catálogo compartido, **When** se lista su contenido, **Then** muestra el paquete con su nombre, su descripción y su versión.

---

### User Story 2 - Un paquete que empaqueta piezas genéricas útiles de verdad (Priority: P1)

Como integrante de otro equipo, quiero que el paquete traiga al menos un subagente, una skill y un hook que funcionen en mi repositorio tal como llegan. Así obtengo el control completo y no piezas sueltas que no sé cómo usar.

**Why this priority**: sin las tres clases de pieza, el paquete no cumple el mínimo del enunciado. Va junto con la historia 1.

**Independent Test**: en el repositorio de prueba con el paquete instalado, usar cada pieza una vez: invocar el subagente, ejecutar la skill y provocar la acción que dispara el hook. Comprobar que cada una cumple su función sin editar nada.

**Acceptance Scenarios**:

1. **Given** el paquete instalado, **When** se invoca el subagente de revisión de cumplimiento, **Then** revisa los cambios del repositorio contra las reglas que ese equipo declara y entrega un informe, sin modificar archivos.
2. **Given** el paquete instalado, **When** se ejecuta la skill, **Then** guía el uso del control y no menciona archivos, rutas ni reglas de originación de este proyecto.
3. **Given** el paquete instalado, **When** un cambio introduce un dato con forma real (por ejemplo, un documento de identidad o una cuenta con formato válido y no reconocible como ficticio), **Then** el hook lo detecta y lo bloquea antes de que se guarde.
4. **Given** el paquete instalado, **When** un cambio solo usa datos reconocibles como ficticios, **Then** el hook no bloquea nada.

---

### User Story 3 - Paquete limpio de supuestos de este repositorio (Priority: P1)

Como responsable de seguridad, quiero que el paquete no contenga credenciales, rutas absolutas ni supuestos propios de este repositorio. Así, publicarlo no filtra nada y funciona en la estructura de cualquier otro equipo.

**Why this priority**: es una restricción del ticket y de la constitución (secretos y datos ficticios). Un paquete que filtra o que solo funciona aquí no es reutilizable.

**Independent Test**: revisar el contenido completo del paquete publicado buscando credenciales, rutas absolutas, nombres de carpetas de este repositorio, números de issue y reglas de originación. Instalarlo en un repositorio con otra estructura y comprobar que funciona.

**Acceptance Scenarios**:

1. **Given** el contenido del paquete, **When** se revisa con una búsqueda de credenciales y de rutas absolutas, **Then** no se encuentra ninguna.
2. **Given** el contenido del paquete, **When** se busca cualquier referencia a carpetas, comandos, tickets o reglas propios de este repositorio, **Then** no se encuentra ninguna.
3. **Given** un repositorio con otra estructura de carpetas, **When** se instala el paquete, **Then** las piezas funcionan sin que el equipo cree rutas ni archivos de este proyecto.
4. **Given** un equipo con sus propias reglas, **When** configura el paquete, **Then** declara sus reglas y umbrales en su propio repositorio, sin editar el paquete.

---

### User Story 4 - Verificación en un repositorio de prueba distinto (Priority: P2)

Como líder técnico, quiero que la instalación se compruebe en un repositorio de prueba distinto de este, y que la comprobación se pueda repetir. Así tengo evidencia de que el paquete funciona fuera de casa, y no solo en el repositorio donde se escribió.

**Why this priority**: da la prueba del criterio de reutilización. Depende de que las historias 1 a 3 existan.

**Independent Test**: seguir el procedimiento de verificación desde cero en un repositorio de prueba nuevo y comprobar que termina con un resultado de aprobado o reprobado por cada pieza.

**Acceptance Scenarios**:

1. **Given** un repositorio de prueba distinto de este, **When** se sigue el procedimiento de verificación, **Then** deja constancia de que cada pieza (subagente, skill y hook) se instaló y funcionó.
2. **Given** una pieza que falla en el repositorio de prueba, **When** termina la verificación, **Then** el resultado la señala como reprobada y indica la causa.
3. **Given** una nueva versión del paquete, **When** se repite el procedimiento, **Then** se obtiene el mismo resultado sin pasos manuales distintos.

---

### User Story 5 - Instalación documentada y decisión registrada (Priority: P2)

Como integrante de otro equipo, quiero una guía de instalación y uso que pueda seguir sin ayuda del equipo autor. Como líder técnico, quiero que la decisión de qué se empaqueta quede registrada con sus alternativas descartadas.

**Why this priority**: sin guía, la reutilización depende de preguntar a quien lo escribió. Sin decisión registrada, no se sabe por qué el paquete tiene esas piezas.

**Independent Test**: pedir a una persona ajena al proyecto que instale y use el paquete siguiendo solo la guía. Comprobar que lo logra, y que `DECISIONES.md` explica qué piezas se empaquetaron y cuáles no.

**Acceptance Scenarios**:

1. **Given** la guía de instalación, **When** una persona ajena al proyecto la sigue, **Then** instala el paquete y usa cada pieza sin consultar al equipo autor.
2. **Given** `DECISIONES.md`, **When** se lee la entrada de este ticket, **Then** explica qué piezas son genéricas y entraron al paquete, cuáles son propias de originación y se quedaron fuera, y qué alternativas se descartaron.
3. **Given** la guía, **When** se busca cómo actualizar o desinstalar el paquete, **Then** los dos procedimientos están documentados.

---

### User Story 6 - El paquete se genera desde las piezas del proyecto sin deriva (Priority: P3)

Como autor del paquete, quiero que este repositorio siga siendo la fuente de las piezas genéricas y que el paquete se genere copiándolas desde aquí. Así, el paquete que se publica es lo que este proyecto usa, y se detecta cuando las dos copias se desalinean.

**Why this priority**: con dos copias, la deriva es el riesgo. Es de mantenimiento y no bloquea la entrega, pero sin esta comprobación el paquete envejece en silencio.

**Independent Test**: generar el paquete desde las piezas del proyecto y comprobar que es idéntico a ellas. Cambiar una pieza del proyecto sin regenerar y comprobar que la comprobación falla y nombra la pieza desalineada.

**Acceptance Scenarios**:

1. **Given** las piezas genéricas de este repositorio, **When** se genera el paquete, **Then** cada pieza del paquete es idéntica a su fuente en el proyecto.
2. **Given** una pieza del proyecto modificada sin regenerar el paquete, **When** se ejecutan las pruebas, **Then** fallan y nombran la pieza desalineada.
3. **Given** una pieza genérica que contiene una referencia propia de este repositorio, **When** se genera el paquete, **Then** la generación se detiene y señala la pieza y la referencia.
4. **Given** el paquete generado, **When** se ejecutan los controles actuales de este repositorio (revisiones, guardián de datos y puerta del pull request), **Then** siguen comportándose igual que antes.

---

### Edge Cases

- ¿Qué pasa si el repositorio destino ya tiene un subagente, una skill o un hook con el mismo nombre que los del paquete? La instalación no debe sobrescribirlo en silencio; el conflicto se informa.
- ¿Qué pasa si el equipo destino no declara sus reglas? El subagente y el hook deben indicar que falta la configuración, sin suponer las reglas de otro equipo.
- ¿Qué pasa si el equipo destino no usa la misma herramienta de formato, de pruebas o de control de versiones? Las piezas no deben depender de ellas para funcionar.
- ¿Qué pasa si el hook no puede evaluar un cambio (entrada ilegible o fallo interno)? Debe fallar de forma explícita y legible, y no dejar pasar el cambio sin avisar.
- ¿Qué pasa si se instala una versión nueva del paquete sobre una anterior? La actualización no debe perder la configuración del equipo.
- ¿Qué pasa si el catálogo compartido no es accesible desde el repositorio destino? La instalación falla con un mensaje que explica la causa.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El paquete MUST incluir al menos un subagente, una skill y un hook reutilizables.
- **FR-002**: El paquete MUST poder instalarse en otro repositorio desde un catálogo compartido, sin copiar archivos a mano.
- **FR-003**: El catálogo compartido MUST listar el paquete con nombre, descripción y versión.
- **FR-004**: El paquete MUST poder desinstalarse sin dejar archivos suyos dentro del repositorio destino.
- **FR-005**: El paquete MUST NOT contener credenciales, rutas absolutas ni referencias a carpetas, comandos, tickets o reglas de originación propios de este repositorio.
- **FR-006**: Cada pieza del paquete MUST funcionar en un repositorio con una estructura de carpetas distinta de la de este proyecto, sin que el equipo cree archivos propios de Crediágil.
- **FR-007**: Las reglas, los umbrales y los patrones que cada equipo quiera aplicar MUST declararse en el repositorio del equipo, sin editar el paquete.
- **FR-008**: Sin configuración del equipo, el subagente y el hook MUST indicarlo de forma explícita y MUST NOT suponer reglas ajenas.
- **FR-009**: El subagente MUST trabajar en modo de solo lectura: informa hallazgos y no modifica archivos.
- **FR-010**: El hook MUST detectar y bloquear datos con forma real antes de que se guarden, y MUST permitir los datos reconocibles como ficticios.
- **FR-011**: Si el hook no puede evaluar un cambio, MUST fallar con un error legible; nunca deja pasar el cambio en silencio.
- **FR-012**: La instalación MUST NOT sobrescribir en silencio una pieza existente con el mismo nombre; el conflicto se informa.
- **FR-013**: Una actualización del paquete MUST conservar la configuración del equipo.
- **FR-014**: El paquete MUST verificarse instalándolo en un repositorio de prueba distinto de este, con un procedimiento repetible que da un resultado por pieza.
- **FR-015**: La instalación, el uso, la actualización y la desinstalación MUST estar documentados para que una persona ajena al proyecto los siga sin ayuda.
- **FR-016**: La decisión de qué se empaqueta MUST registrarse en `DECISIONES.md`, con las piezas genéricas incluidas, las piezas propias de originación excluidas y las alternativas descartadas.
- **FR-017**: Este repositorio MUST seguir siendo la fuente de las piezas genéricas, y el paquete MUST generarse copiándolas desde aquí, sin ediciones a mano en el paquete.
- **FR-021**: Las pruebas MUST fallar, nombrando la pieza, cuando una pieza del paquete difiere de su fuente en el proyecto.
- **FR-022**: La generación del paquete MUST detenerse, señalando pieza y referencia, si una pieza genérica contiene una referencia propia de este repositorio (FR-005).
- **FR-018**: El contenido del paquete MUST usar únicamente datos ficticios en ejemplos y pruebas, conforme a la constitución (Principio II).

- **FR-019**: El paquete MUST incluir exactamente estas piezas genéricas: el hook que detecta secretos y datos con forma real, la convención de datos ficticios que usa ese hook, la restricción de solo lectura de los revisores, un subagente revisor de cumplimiento que lee las reglas declaradas por el equipo y una skill que guía su uso.
- **FR-020**: El paquete MUST NOT incluir `spec-primero`, `puerta-pr`, los comandos `/ticket-*`, las skills `speckit-*`, la política de crédito ni código de `src/`.

### Key Entities *(include if feature involves data)*

- **Paquete reutilizable**: conjunto versionado de piezas que un equipo instala como una unidad. Tiene nombre, descripción, versión y lista de piezas.
- **Pieza**: subagente, skill o hook incluido en el paquete. Cada una es genérica y no depende de este repositorio.
- **Catálogo compartido**: lista de paquetes instalables desde la que otro equipo descubre e instala el paquete.
- **Configuración del equipo**: reglas, umbrales y patrones que declara cada equipo en su propio repositorio y que las piezas leen.
- **Resultado de verificación**: constancia por pieza (instalada, funcionó o falló, con causa) obtenida en el repositorio de prueba.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un equipo ajeno instala el paquete en su repositorio en menos de 10 minutos y sin copiar ningún archivo a mano.
- **SC-002**: El 100 % de las piezas del paquete (subagente, skill y hook) funcionan en el repositorio de prueba sin editarlas.
- **SC-003**: Una búsqueda de credenciales, rutas absolutas y referencias propias de este repositorio sobre todo el paquete da cero coincidencias.
- **SC-004**: El hook bloquea el 100 % de los datos con forma real de un conjunto de prueba y no bloquea ninguno de los datos reconocibles como ficticios.
- **SC-005**: Una persona ajena al proyecto instala y usa cada pieza siguiendo solo la guía, en al menos un intento completo sin ayuda.
- **SC-006**: Cero piezas del paquete difieren de su fuente en el proyecto tras generarlo, y todas las pruebas existentes siguen en verde.
- **SC-007**: La verificación en el repositorio de prueba se repite desde cero y da el mismo resultado en dos ejecuciones seguidas.

## Assumptions

- Los equipos destino usan el mismo asistente de desarrollo que este proyecto y pueden registrar un catálogo compartido y alojarlo en un repositorio accesible para ellos.
- Las piezas del paquete son las genéricas definidas en Clarifications (FR-019). Lo propio de originación y del flujo de tickets de este proyecto queda fuera de alcance.
- Este repositorio no instala su propio paquete: conserva las piezas genéricas en su sitio y el paquete es una copia generada de ellas (FR-017). No hay dos copias editables.
- El repositorio de prueba distinto es un repositorio ficticio creado para la verificación, sin datos reales.
- Las piezas de las que depende este ticket (#5 y #6: guardarraíles con hooks y revisión independiente) ya existen y son la base de lo que se empaqueta.
- Fuera de alcance: publicar el paquete en un catálogo público, soportar otros asistentes de desarrollo y empaquetar piezas del agente de crédito o del servidor del core.
