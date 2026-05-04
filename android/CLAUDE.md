# MiniDBoat — Contexto del proyecto

## Qué es este proyecto
Aplicación Android para gestión y seguimiento de equipos de Dragon Boat. Consume la API de E-DragonBoat.

## Rutas
- Repo: `C:\Users\Diego\AndroidStudioProjects\MiniDBoat`
- API backend: `C:\Users\Diego\AndroidStudioProjects\edragonboat-api`

## Stack técnico
| Capa | Tecnología |
|------|-----------|
| Lenguaje | Kotlin 2.0.x |
| UI | Jetpack Compose + Material 3 |
| Build | Gradle Kotlin DSL, AGP 9, minSdk 34 |
| BOM | Compose BOM 2024.09 |
| Red | Retrofit 2 + OkHttp + Gson |
| Ubicación | Google Fused Location Provider |
| Arquitectura | ViewModel + Coroutines + Compose Navigation |

## Convenciones del proyecto
- Screens en `@Composable` functions, una por archivo
- ViewModels exponen `StateFlow` o `UiState` sealed class
- Llamadas de red siempre en `viewModelScope` con `Dispatchers.IO`
- Navegación centralizada en un `NavHost` con rutas como `sealed class`
- Nombres: `XxxScreen.kt`, `XxxViewModel.kt`, `XxxRepository.kt`

## Comandos útiles
```bash
# Build debug
./gradlew assembleDebug

# Tests unitarios
./gradlew test

# Tests instrumentados
./gradlew connectedAndroidTest

# Lint
./gradlew lint
```

## Agentes disponibles
- `android-expert` — especialista en Kotlin/Compose, arquitectura, UI y red
