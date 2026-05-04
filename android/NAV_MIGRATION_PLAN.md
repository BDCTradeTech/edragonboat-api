# Plan de migración a NavHost — MiniDBoat

Versión del análisis: 2026-05-04
Stack objetivo: Compose Navigation 2.8.x, Kotlin 2.0.21, Compose BOM 2024.09.00

---

## 1. Estado actual de la navegación

La app usa navegación manual sin NavHost ni NavController:

- `MainActivity` mantiene dos `rememberSaveable`:
  - `navRoute: String` — identifica la pantalla activa (una de ocho constantes `NAV_*`)
  - `navRoutineId: String?` — ID de la rutina seleccionada (único argumento no primitivo que cruza pantallas)
- La función `appScreenFromNav()` reconstruye la `sealed class AppScreen` a partir de esos dos strings en cada recomposición.
- El `when(currentScreen)` en `MainActivity.setContent` renderiza el Composable correspondiente.
- `AuthScreen` está fuera del grafo: se muestra condicionalmente con `if (!authCompleted)`, y `authCompleted` también es `rememberSaveable`.
- No hay back stack gestionado por el framework; cada pantalla llama `onBack` que setea `navRoute = NAV_MAIN` (o el padre correspondiente).

Pantallas registradas actualmente:

| Constante NAV_* | AppScreen | Archivo |
|---|---|---|
| `NAV_MAIN` | `AppScreen.Main` | `MainActivity.kt` (MainScreen inline) |
| `NAV_EJERCICIOS` | `AppScreen.Ejercicios` | `EjerciciosScreen.kt` |
| `NAV_EJERCICIO_RUTINA` | `AppScreen.EjercicioRutina(routine)` | `EjercicioRutinaScreen.kt` |
| `NAV_LIBRE` | `AppScreen.Libre` | `LibreScreen.kt` (mode=Libre) |
| `NAV_COMPETENCIAS` | `AppScreen.Competencias` | `CompetenciasScreen.kt` |
| `NAV_COMPETENCIA_RUN` | `AppScreen.CompetenciaRun` | `LibreScreen.kt` (mode=Competencia) |
| `NAV_GRAFICOS` | `AppScreen.Graficos` | `GraficosScreen.kt` |
| `NAV_CONFIG` | `AppScreen.Config` | `ConfigScreen.kt` |
| — (guard) | fuera del grafo | `AuthScreen.kt` |

---

## 2. Prerrequisitos — dependencias Gradle

El proyecto **NO tiene** `androidx.navigation:navigation-compose` en `libs.versions.toml` ni en `app/build.gradle.kts`. Hay que agregar:

### 2.1 `gradle/libs.versions.toml`

```toml
[versions]
# Agregar:
navigationCompose = "2.8.9"

[libraries]
# Agregar:
androidx-navigation-compose = { group = "androidx.navigation", name = "navigation-compose", version.ref = "navigationCompose" }
```

`2.8.9` es la última stable de la serie 2.8 compatible con Compose BOM 2024.09 y Kotlin 2.0.x (el BOM 2024.09 no bundlea Navigation; hay que declararlo explícitamente).

### 2.2 `app/build.gradle.kts`

```kotlin
dependencies {
    // Agregar junto a las demás implementaciones:
    implementation(libs.androidx.navigation.compose)
}
```

No se requiere el plugin `kotlin-serialization` si se usan rutas como strings o sealed class sin `@Serializable`. Si en el futuro se quiere usar la API typesafe de Navigation 2.8 con objetos serializados, hay que agregar también:

```toml
# libs.versions.toml
kotlin-serialization = "2.0.21"   # misma versión que kotlin
kotlinx-serialization-json = "1.7.3"

[plugins]
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin-serialization" }
```

Para esta migración se propone **rutas como strings** (enfoque conservador, sin serialización de objetos).

---

## 3. Estructura de rutas propuesta

### 3.1 Sealed class `AppDestination`

Reemplaza `AppScreen` y las constantes `NAV_*`. Archivo nuevo: `navigation/AppDestination.kt`.

```kotlin
package com.example.minidboat.navigation

sealed class AppDestination(val route: String) {
    data object Auth        : AppDestination("auth")
    data object Main        : AppDestination("main")
    data object Ejercicios  : AppDestination("ejercicios")
    data object EjercicioRutina : AppDestination("ejercicio_rutina/{routineId}") {
        fun createRoute(routineId: String) = "ejercicio_rutina/$routineId"
        const val ARG_ROUTINE_ID = "routineId"
    }
    data object Libre            : AppDestination("libre")
    data object CompetenciaRun   : AppDestination("competencia_run")
    data object Graficos         : AppDestination("graficos")
    data object Competencias     : AppDestination("competencias")
    data object Config           : AppDestination("config")
}
```

### 3.2 Grafo NavHost

Archivo nuevo: `navigation/AppNavHost.kt` (o directamente en `MainActivity`).

```kotlin
@Composable
fun AppNavHost(
    navController: NavHostController,
    routinesViewModel: RoutinesViewModel,
) {
    NavHost(
        navController = navController,
        startDestination = AppDestination.Auth.route,
    ) {
        composable(AppDestination.Auth.route) {
            AuthScreen(
                onLoginSuccess = {
                    navController.navigate(AppDestination.Main.route) {
                        popUpTo(AppDestination.Auth.route) { inclusive = true }
                    }
                },
                onGuest = {
                    navController.navigate(AppDestination.Main.route) {
                        popUpTo(AppDestination.Auth.route) { inclusive = true }
                    }
                },
                onExit = { /* necesita Activity.finish() — ver §5.3 */ },
            )
        }

        composable(AppDestination.Main.route) {
            MainScreen(
                onEjerciciosClick = { navController.navigate(AppDestination.Ejercicios.route) },
                onLibreClick      = { navController.navigate(AppDestination.Libre.route) },
                onGraficosClick   = { navController.navigate(AppDestination.Graficos.route) },
                onCompetenciasClick = { navController.navigate(AppDestination.Competencias.route) },
                onConfigClick     = { navController.navigate(AppDestination.Config.route) },
                onSalirClick      = { /* finish() desde Activity */ },
                onChangeAccount   = {
                    // logout + navigate back to Auth
                    navController.navigate(AppDestination.Auth.route) {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }

        composable(AppDestination.Ejercicios.route) {
            val routines by routinesViewModel.routines.collectAsState()
            val importBusy by routinesViewModel.importBusy.collectAsState()
            EjerciciosScreen(
                routines = routines,
                importBusy = importBusy,
                canImportFromCloud = /* igual que antes */,
                onImportFromCloud = { routinesViewModel.importRoutinesFromCloud(context) },
                onBack = { navController.popBackStack() },
                onRoutineSelected = { routine ->
                    navController.navigate(AppDestination.EjercicioRutina.createRoute(routine.id))
                },
            )
        }

        composable(
            route = AppDestination.EjercicioRutina.route,
            arguments = listOf(navArgument(AppDestination.EjercicioRutina.ARG_ROUTINE_ID) {
                type = NavType.StringType
            }),
        ) { backStackEntry ->
            val routineId = backStackEntry.arguments?.getString(
                AppDestination.EjercicioRutina.ARG_ROUTINE_ID
            )
            val routines by routinesViewModel.routines.collectAsState()
            val routine = routines.find { it.id == routineId }
            if (routine != null) {
                EjercicioRutinaScreen(
                    routine = routine,
                    onBack = { navController.popBackStack() },
                )
            } else {
                // Rutina no encontrada (carga aún en curso o borrada)
                LaunchedEffect(Unit) { navController.popBackStack() }
            }
        }

        composable(AppDestination.Libre.route) {
            LibreScreen(
                onBack = { navController.popBackStack() },
                mode = TrainingScreenMode.Libre,
            )
        }

        composable(AppDestination.CompetenciaRun.route) {
            LibreScreen(
                onBack = { navController.popBackStack() },
                mode = TrainingScreenMode.Competencia(
                    onSubmittedNavigateHome = {
                        navController.navigate(AppDestination.Main.route) {
                            popUpTo(AppDestination.Main.route) { inclusive = false }
                        }
                    },
                ),
            )
        }

        composable(AppDestination.Graficos.route) {
            GraficosScreen(onBack = { navController.popBackStack() })
        }

        composable(AppDestination.Competencias.route) {
            CompetenciasScreen(
                onBack = { navController.popBackStack() },
                onCompetir = { navController.navigate(AppDestination.CompetenciaRun.route) },
            )
        }

        composable(AppDestination.Config.route) {
            ConfigScreen(onBack = { navController.popBackStack() })
        }
    }
}
```

---

## 4. Análisis pantalla por pantalla

### 4.1 AuthScreen

**Archivo:** `ui/auth/AuthScreen.kt`
**Ruta propuesta:** `auth`
**Argumentos:** ninguno
**ViewModel:** `AuthViewModel` (instanciado con `viewModel(factory = AuthViewModelFactory(...))` internamente — no cambia)

**Notas de riesgo:**
- Actualmente está fuera del grafo (`if (!authCompleted)`). Al moverla al NavHost, la lógica de logout en `MainScreen.onChangeAccount` debe navegar a `auth` con `popUpTo(0) { inclusive = true }` para limpiar todo el back stack, o el usuario podría volver a Main con Back.
- `onExit` llama `finish()` en la Activity. El Composable no tiene acceso directo a la Activity dentro del NavHost — hay que pasarla como lambda desde `MainActivity` o usar `LocalContext.current as Activity`. Actualmente ya usa `LocalContext`, así que la solución más limpia es mantener `onExit: () -> Unit` y pasarlo desde `MainActivity.setContent`.
- La pantalla persiste email/password en `AppPreferences` directamente. Esto no cambia con NavHost.

---

### 4.2 MainScreen

**Archivo:** `MainActivity.kt` (composable `MainScreen` inline al final del archivo)
**Ruta propuesta:** `main`
**Argumentos:** ninguno
**ViewModel:** ninguno propio — lee `AppPreferences` y `cloudRepository` directo con `LocalContext`

**Notas de riesgo:**
- `MainScreen` está definido en `MainActivity.kt`, no en su propio archivo. Si se migra a NavHost dentro de `MainActivity`, puede quedar ahí sin cambio. Si se extrae a un archivo separado (`ui/main/MainScreen.kt`), no tiene dependencias de Activity que impidan el movimiento.
- `RoutinesViewModel` ya se instancia en `MainActivity` como `by lazy {}` y se pasa por parámetro al NavHost. Con NavHost podría seguir pasándose como parámetro al `AppNavHost` composable, o elevarse a un `viewModel()` con `ViewModelStoreOwner` de la Activity — ambas opciones son válidas.
- `onChangeAccount` tiene lógica de logout (`cloudRepository.logout()` / `AppPreferences.setGuestMode`). Esta lógica debe ejecutarse **antes** de navegar a `auth`; no cambia con NavHost, pero la lambda debe coordinarse con la navegación.

---

### 4.3 EjerciciosScreen

**Archivo:** `ui/ejercicios/EjerciciosScreen.kt`
**Ruta propuesta:** `ejercicios`
**Argumentos:** ninguno (recibe la lista de rutinas como parámetro del Composable desde el NavHost)
**ViewModel:** ninguno propio — usa `RoutinesViewModel` pasado desde el NavHost

**Notas de riesgo:**
- Actualmente `routines`, `importBusy` y `canImportFromCloud` vienen como parámetros. Esta dependencia de `RoutinesViewModel` debe resolverse desde el NavHost pasando el ViewModel al composable de la ruta `ejercicios`. Una alternativa es que `EjerciciosScreen` instancie su propio `viewModel()` con factory; la opción más limpia con NavHost es pasar `routinesViewModel` como parámetro al `AppNavHost` composable.
- `canImportFromCloud` combina dos llamadas a `AppPreferences` — no cambia.

---

### 4.4 EjercicioRutinaScreen

**Archivo:** `ui/ejercicios/EjercicioRutinaScreen.kt`
**Ruta propuesta:** `ejercicio_rutina/{routineId}` (argumento path `routineId: String`)
**Argumentos:** `routineId` (String) — el objeto `Routine` se busca en `routinesViewModel.routines` usando el ID recibido
**ViewModel:** `LibreViewModel` instanciado con `viewModel()` sin factory (usa application context internamente via `MiniDBoatApplication`)

**Este es el caso más complejo de la migración.** Explicación detallada:

**Problema:** `EjercicioRutinaScreen` recibe un objeto `Routine` directamente. `Routine` contiene una lista de ejercicios (`List<Exercise>`) — no es `Parcelable` ni `@Serializable`. El sistema actual lo resuelve guardando solo el `routineId` (String) en `rememberSaveable` y buscando el objeto en el `StateFlow<List<Routine>>` al restaurar.

**Solución propuesta:** Mantener la misma estrategia — pasar `routineId` como `navArgument` de tipo `StringType`, y en el composable de la ruta resolver `val routine = routines.find { it.id == routineId }`. Si `routines` aún está cargando (lista vacía), mostrar un indicador de carga o simplemente no navegar hasta que la lista esté disponible.

**Alternativa rechazada:** Hacer `Routine` `@Serializable` y pasar el objeto completo como argumento JSON. Genera acoplamiento innecesario con kotlinx-serialization y puede exceder el límite del bundle de argumentos de Navigation con rutinas de muchos ejercicios.

**Notas de riesgo adicionales:**
- `LibreViewModel` se crea con `viewModel()` sin key. En el sistema actual, cada visita a `EjercicioRutinaScreen` crea una instancia fresca porque la composición de la pantalla se destruye al salir. Con NavHost, el ViewModel vive mientras la entrada esté en el back stack. Si el usuario navega a `EjercicioRutinaScreen`, pulsa Back, y vuelve a entrar a la misma rutina, el ViewModel podría tener estado residual. La llamada existente `viewModel.reset()` en `handleBack()` mitiga esto.
- El `LaunchedEffect` de avance automático de ejercicio depende del estado del ViewModel; con NavHost y back stack esto no cambia funcionalmente.

---

### 4.5 LibreScreen (modo Libre)

**Archivo:** `ui/libre/LibreScreen.kt`
**Ruta propuesta:** `libre`
**Argumentos:** ninguno
**ViewModel:** `LibreViewModel` instanciado con `viewModel(key = "training_libre")`

**Notas de riesgo:**
- `LibreScreen` usa `viewModel(key = vmKey)` para aislar las instancias de Libre y Competencia. Con NavHost cada destino tiene su propio `ViewModelStoreOwner` (el `NavBackStackEntry`), por lo que la key explícita deja de ser necesaria — pero no rompe nada si se deja. Se puede eliminar el `viewModelKey()` helper una vez confirmado que los dos destinos (`libre` y `competencia_run`) usan NavBackStackEntry separados.
- `BackHandler` ya está presente en `LibreScreen`. Con NavHost hay que evaluar si el `BackHandler` sigue siendo necesario o si el sistema de navegación ya gestiona el back correctamente. En la mayoría de los casos se puede eliminar o reemplazar por lógica en `onBack`.
- La pantalla llama `viewModel.reset()` antes de hacer `onBack()`. Esto debe mantenerse porque el ViewModel persiste mientras el back stack entry existe.

---

### 4.6 CompetenciaRun (LibreScreen modo Competencia)

**Archivo:** `ui/libre/LibreScreen.kt` (mismo composable, distinto modo)
**Ruta propuesta:** `competencia_run`
**Argumentos:** ninguno
**ViewModel:** `LibreViewModel` instanciado con `viewModel(key = "training_competencia")`

**Notas de riesgo:**
- `TrainingScreenMode.Competencia` recibe `onSubmittedNavigateHome: () -> Unit` como lambda. Con NavHost esta lambda se convierte en `{ navController.navigate(AppDestination.Main.route) { popUpTo(AppDestination.Main.route) { inclusive = false } } }`. Funciona correctamente.
- Al completar la competencia y navegar a Main, el back stack queda: `main -> competencias -> competencia_run`. Si el usuario aprieta Back desde Main después de enviar, volverá a `competencia_run` (con el ViewModel en estado finalizado pero la pantalla reiniciada). La solución es usar `popUpTo(AppDestination.Competencias.route) { inclusive = true }` en `onSubmittedNavigateHome` para limpiar `competencias` y `competencia_run` del stack.
- El countdown automático arranca en `LaunchedEffect(Unit)`. Con NavHost, si el usuario regresa a `competencia_run` via back stack (caso borde), el countdown volvería a dispararse. Mitigación: verificar `state.isStarted` antes de iniciar el countdown.

---

### 4.7 CompetenciasScreen

**Archivo:** `ui/competencias/CompetenciasScreen.kt`
**Ruta propuesta:** `competencias`
**Argumentos:** ninguno
**ViewModel:** ninguno — toda la configuración se lee/escribe directamente en `AppPreferences`

**Notas de riesgo:**
- La pantalla persiste el estado de los dropdowns en `remember {}` (no `rememberSaveable`). Esto significa que si el sistema destruye la composición (rotación, proceso death), los valores se pierden pero se releen de `AppPreferences` al recomponer. Comportamiento idéntico con NavHost.
- No hay ViewModel que gestionar. Pantalla de bajo riesgo.

---

### 4.8 GraficosScreen

**Archivo:** `ui/graficos/GraficosScreen.kt`
**Ruta propuesta:** `graficos`
**Argumentos:** ninguno
**ViewModel:** `GraficosViewModel` instanciado internamente con `viewModel(factory = GraficosViewModel.Factory(context))`

**Notas de riesgo:**
- `GraficosViewModel.Factory` recibe `applicationContext`. Con NavHost el composable sigue siendo capaz de obtenerlo via `LocalContext.current.applicationContext`, no hay cambio.
- El `viewModel` vive ligado al `NavBackStackEntry` de `graficos`. Al salir y volver, se crea una instancia nueva que relanza `loadFiles()`. Comportamiento idéntico al actual (cada vez que se entra a la pantalla se carga de nuevo). Si se quiere caché entre visitas, el ViewModel debería elevarse a un scope mayor (Activity), pero eso es un cambio opcional posterior.

---

### 4.9 ConfigScreen

**Archivo:** `ui/config/ConfigScreen.kt`
**Ruta propuesta:** `config`
**Argumentos:** ninguno
**ViewModel:** `ConfigViewModel` instanciado internamente con `viewModel(factory = ConfigViewModelFactory(cloudRepository))`

**Notas de riesgo:**
- `ConfigViewModel` recibe `CloudRepository` via factory. `cloudRepository` es `val` en `MiniDBoatApplication`, accesible via `(context.applicationContext as MiniDBoatApplication).cloudRepository`. Sin cambios con NavHost.
- El cambio de idioma (`AppCompatDelegate.setApplicationLocales`) recrea la Activity. Con NavHost este recreation destruye y recrea el `NavController`; el estado de navegación se perderá a menos que se use `rememberNavController()` (que ya persiste el back stack en `savedInstanceState` automáticamente). Este es el único caso donde hay que verificar que el `startDestination` configurado en el NavHost sea correcto post-recreación (debe seguir siendo `Auth` si `authCompleted` no está persistido, o `Main` si ya lo estaba). Solución: mantener `authCompleted` en `rememberSaveable` al nivel del `AppNavHost` caller, o persistirlo en `savedInstanceState` de la Activity.

---

## 5. Riesgos transversales

### 5.1 `RoutinesViewModel` compartido entre destinos

`RoutinesViewModel` se crea en `MainActivity` (Activity scope) y se comparte entre `EjerciciosScreen` y `EjercicioRutinaScreen`. Con NavHost este modelo puede seguir viviendo en el scope de la Activity (instanciado con `viewModels()` o el `by lazy` actual) y pasarse como parámetro al `AppNavHost`. Es la opción correcta — no convertirlo a `viewModel()` dentro de un composable de ruta, porque eso crearía una instancia por destino y se perdería la lista de rutinas entre navegaciones.

### 5.2 `authCompleted` fuera del NavHost

Actualmente `authCompleted` es un `rememberSaveable` en `setContent`. Con NavHost el grafo completo incluye `Auth` como primer destino. La flag `authCompleted` ya no es necesaria si el back stack gestionado por Navigation hace su trabajo (`popUpTo(Auth) { inclusive = true }` al loguearse). El riesgo es la recreación de Activity por cambio de idioma: si el NavController restaura el back stack desde `savedInstanceState` pero el usuario estaba en `Main`, el destino `Main` se mostrará sin que `authCompleted` sea `true` — lo cual con el nuevo modelo no importa porque `Auth` ya se sacó del stack.

### 5.3 `finish()` desde composables

`AuthScreen.onExit` y `MainScreen.onSalirClick` llaman `finish()`. Los composables dentro del NavHost no tienen referencia directa a la Activity. Patrón recomendado:

```kotlin
// En MainActivity.setContent:
val activity = this
AppNavHost(
    navController = rememberNavController(),
    routinesViewModel = routinesViewModel,
    onFinish = { activity.finish() },
)
```

### 5.4 Pantalla siempre en landscape / fullscreen

`MainActivity` oculta las barras del sistema en `onWindowFocusChanged` y agrega `FLAG_KEEP_SCREEN_ON`. Esto es independiente del NavHost y no cambia.

### 5.5 Argumento `onSubmittedNavigateHome` en `TrainingScreenMode.Competencia`

Esta lambda cruza el límite de la composición (se define en el NavHost y se pasa al Composable que la llama desde el interior de `LibreViewModel.submitCompetenciaSession`). Con NavHost la lambda captura el `navController`. Hay que asegurarse de que el `navController` no sea `null` al momento de la llamada (es un objeto estable, no hay riesgo real, pero conviene anotarlo).

### 5.6 Back stack y estado de entrenamiento activo

Si el usuario está en `LibreScreen` con una sesión activa y aprieta Back, el ViewModel se destruye al salir del NavBackStackEntry. Actualmente `viewModel.reset()` se llama explícitamente en `handleBack()`. Con NavHost y `popBackStack()`, el ViewModel del destino saliente se destruye automáticamente después de que la composición deja el stack. El `reset()` en `handleBack()` (que llama `onBack()` que llama `navController.popBackStack()`) sigue siendo el lugar correcto para hacer cleanup antes de destruir el ViewModel.

---

## 6. Orden de migración recomendado

Migrar pantalla por pantalla, en este orden, para poder verificar cada paso antes del siguiente:

**Fase 1 — Infraestructura (sin cambios de UI):**
1. Agregar la dependencia `navigation-compose` al catálogo de versiones y `build.gradle.kts`.
2. Crear `AppDestination.kt` con todas las rutas.
3. Crear `AppNavHost.kt` con el grafo completo pero manteniendo el `if (!authCompleted)` guard temporalmente fuera si se quiere migración incremental.
4. Reemplazar el `when(currentScreen)` de `MainActivity` por `AppNavHost(rememberNavController(), routinesViewModel)`.

**Fase 2 — Pantallas sin argumentos (bajo riesgo):**
5. `ConfigScreen` — ningún argumento, ViewModel interno, sin efectos secundarios en navegación.
6. `GraficosScreen` — ningún argumento, ViewModel interno con factory de context.
7. `CompetenciasScreen` — ningún argumento, sin ViewModel.
8. `MainScreen` — ningún argumento, verificar `onChangeAccount` con logout + navigate.

**Fase 3 — Flujo de autenticación:**
9. `AuthScreen` — mover dentro del NavHost, eliminar `authCompleted` como booleano externo, verificar recreación de Activity por cambio de idioma.

**Fase 4 — Flujo de entrenamiento (mayor riesgo):**
10. `LibreScreen` (modo Libre) — verificar countdown, BackHandler, reset del ViewModel.
11. `CompetenciaRun` (LibreScreen modo Competencia) — verificar `onSubmittedNavigateHome` y limpieza del back stack.
12. `CompetenciasScreen -> CompetenciaRun` — verificar el flujo end-to-end.

**Fase 5 — Flujo de rutinas (mayor riesgo por argumento objeto):**
13. `EjerciciosScreen` — verificar que `RoutinesViewModel` se pase correctamente al NavHost.
14. `EjercicioRutinaScreen` — implementar lookup `routineId -> Routine` en el NavBackStackEntry, verificar edge case de lista vacía durante carga.

---

## 7. Code smells detectados durante el análisis

Estos no están relacionados directamente con la migración NavHost pero se identificaron al leer el código:

1. **`MainScreen` inline en `MainActivity.kt`:** El composable `MainScreen` (270+ líneas) y el composable privado `MenuButton` viven en el mismo archivo que la Activity. Debería extraerse a `ui/main/MainScreen.kt`.

2. **`canImportFromCloud` calculado en el sitio de llamada:** En el `when(screen is AppScreen.Ejercicios)` de `MainActivity`, la expresión `AppPreferences.isCloudLoggedIn(context) && !AppPreferences.isGuestMode(context)` se evalúa en la composición de la Activity. Con NavHost ese cálculo queda en el lambda de la ruta `ejercicios`, que es correcto, pero idealmente debería venir de un StateFlow en `RoutinesViewModel`.

3. **`RoutinesViewModel` instanciado con factory anónima en `MainActivity`:** El `ViewModelProvider.Factory` anónimo podría reemplazarse por un `ViewModelProvider.AndroidViewModelFactory` o un factory named, consistente con `AuthViewModelFactory` y `ConfigViewModelFactory` que sí están externalizados.

4. **`GraficosViewModel.Factory` recibe `Context` en vez de `Application`:** Recibir `applicationContext` es correcto, pero la convención de `AndroidViewModel` sería preferible para evitar leaks si en algún momento se pasa un contexto no-application.

5. **`LibreScreen` y `EjercicioRutinaScreen` duplican la lógica de countdown:** El bloque `LaunchedEffect(countdownSession)` con el loop `downTo 0` + `delay(50) + delay(950)` aparece en ambos archivos. Candidato a extraerse a un composable `CountdownController` o una función de extensión de ViewModel.
