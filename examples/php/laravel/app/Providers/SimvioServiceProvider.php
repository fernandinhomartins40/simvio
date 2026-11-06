<?php

declare(strict_types=1);

namespace App\Providers;

use App\Services\SimvioService;
use Illuminate\Support\ServiceProvider;

/** Registre em bootstrap/providers.php (Laravel 11+) ou config/app.php (Laravel 10). */
class SimvioServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(SimvioService::class, fn () => SimvioService::fromConfig());
    }
}
