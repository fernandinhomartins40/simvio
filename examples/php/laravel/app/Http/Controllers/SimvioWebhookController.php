<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Signup;
use App\Services\SimvioService;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Recebe avisos automáticos da Simvio.
 * - valida a assinatura sobre o corpo BRUTO, em tempo constante, com tolerância de 5 min;
 * - deduplica por event_id (entrega "pelo menos uma vez");
 * - não confia no conteúdo do aviso para ativar: confirma pela API (SignupController::confirm).
 * Exclua esta rota da verificação CSRF (ver README).
 */
class SimvioWebhookController extends Controller
{
    public function __construct(
        private readonly SimvioService $simvio,
        private readonly SignupController $signups,
    ) {}

    public function __invoke(Request $request): Response
    {
        try {
            $event = $this->simvio->verifyWebhook(
                $request->getContent(),
                $request->header('Simvio-Event-Id'),
                $request->header('Simvio-Timestamp'),
                $request->header('Simvio-Signature'),
            );
        } catch (\Throwable $e) {
            // Não registre o corpo nem os cabeçalhos de assinatura.
            Log::warning('webhook simvio rejeitado', ['motivo' => $e->getMessage()]);
            return response('', 400);
        }

        try {
            // A chave primária em event_id impede processar o mesmo evento duas vezes, mesmo em paralelo.
            DB::table('simvio_processed_events')->insert([
                'event_id' => $event['event_id'],
                'received_at' => now(),
            ]);
        } catch (QueryException) {
            return response('', 204); // já processado
        }

        try {
            $signup = Signup::find($event['reference'] ?? null);
            if ($signup && $signup->verification_id === ($event['verification_id'] ?? null)) {
                $this->signups->confirm($signup);
            }
        } catch (\Throwable $e) {
            // Libera o event_id para a Simvio tentar de novo.
            DB::table('simvio_processed_events')->where('event_id', $event['event_id'])->delete();
            Log::error('falha ao processar webhook simvio', ['event_id' => $event['event_id'], 'erro' => $e->getMessage()]);
            return response('', 500);
        }

        return response('', 204);
    }
}
