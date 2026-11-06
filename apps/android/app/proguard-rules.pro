# Workers são instanciados por reflexão pelo WorkManager.
-keep class * extends androidx.work.ListenableWorker { <init>(...); }
