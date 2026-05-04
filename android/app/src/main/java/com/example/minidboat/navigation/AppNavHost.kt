package com.example.minidboat.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.example.minidboat.MiniDBoatApplication
import com.example.minidboat.MainScreen
import com.example.minidboat.data.AppPreferences
import com.example.minidboat.ui.auth.AuthScreen
import com.example.minidboat.ui.competencias.CompetenciasScreen
import com.example.minidboat.ui.config.ConfigScreen
import com.example.minidboat.ui.ejercicios.EjercicioRutinaScreen
import com.example.minidboat.ui.ejercicios.EjerciciosScreen
import com.example.minidboat.ui.graficos.GraficosScreen
import com.example.minidboat.ui.libre.LibreScreen
import com.example.minidboat.ui.libre.TrainingScreenMode
import com.example.minidboat.viewmodel.RoutinesViewModel

@Composable
fun AppNavHost(
    navController: NavHostController,
    routinesViewModel: RoutinesViewModel,
    onFinish: () -> Unit,
) {
    val context = LocalContext.current

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
                onExit = onFinish,
            )
        }

        composable(AppDestination.Main.route) {
            MainScreen(
                onEjerciciosClick = { navController.navigate(AppDestination.Ejercicios.route) },
                onLibreClick = { navController.navigate(AppDestination.Libre.route) },
                onGraficosClick = { navController.navigate(AppDestination.Graficos.route) },
                onCompetenciasClick = { navController.navigate(AppDestination.Competencias.route) },
                onConfigClick = { navController.navigate(AppDestination.Config.route) },
                onSalirClick = onFinish,
                onChangeAccount = {
                    if (AppPreferences.isCloudLoggedIn(context)) {
                        (context.applicationContext as MiniDBoatApplication).cloudRepository.logout()
                    } else {
                        AppPreferences.setGuestMode(context, false)
                    }
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
                canImportFromCloud = AppPreferences.isCloudLoggedIn(context) &&
                    !AppPreferences.isGuestMode(context),
                onImportFromCloud = { routinesViewModel.importRoutinesFromCloud(context) },
                onBack = { navController.popBackStack() },
                onRoutineSelected = { routine ->
                    navController.navigate(AppDestination.EjercicioRutina.createRoute(routine.id))
                },
            )
        }

        composable(
            route = AppDestination.EjercicioRutina.route,
            arguments = listOf(
                navArgument(AppDestination.EjercicioRutina.ARG_ROUTINE_ID) {
                    type = NavType.StringType
                }
            ),
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
                            popUpTo(AppDestination.Competencias.route) { inclusive = true }
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
