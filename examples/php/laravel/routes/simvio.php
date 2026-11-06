<?php

// Inclua em routes/web.php:  require __DIR__.'/simvio.php';

use App\Http\Controllers\SignupController;
use App\Http\Controllers\SimvioWebhookController;
use Illuminate\Support\Facades\Route;

Route::post('/cadastro', [SignupController::class, 'store'])->name('signup.store');
Route::get('/cadastro/{signup}', [SignupController::class, 'show'])->name('signup.show');
Route::post('/cadastro/{signup}/nova-tentativa', [SignupController::class, 'retry'])->name('signup.retry');

// Sem sessão nem CSRF: autenticado pela assinatura HMAC.
Route::post('/webhooks/simvio', SimvioWebhookController::class)->name('webhooks.simvio');
