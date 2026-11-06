<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Signup;
use App\Services\SimvioService;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Cadastro com confirmação de celular por SMS reverso.
 * A volta do usuário pela redirect_url NUNCA ativa a conta: só a confirmação pela API.
 */
class SignupController extends Controller
{
    public function __construct(private readonly SimvioService $simvio) {}

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'phone' => ['required', 'string', 'max:20'],
        ]);
        $phone = '+' . preg_replace('/\D/', '', $data['phone']);
        if (!preg_match('/^\+55[1-9][1-9]9\d{8}$/', $phone)) {
            return back()->withErrors(['phone' => 'Informe um celular com DDD, ex.: (11) 98765-4321.'])->withInput();
        }

        $signup = Signup::create([
            'id' => (string) Str::uuid(),
            'name' => $data['name'],
            'phone' => $phone,
            'status' => 'pending_phone',
            'attempt' => 1,
        ]);

        return $this->startVerification($signup);
    }

    /** Nova tentativa (ex.: expirou). A nova verificação cancela a anterior da mesma reference. */
    public function retry(Signup $signup): RedirectResponse
    {
        abort_if($signup->status === 'active', 409);
        $signup->increment('attempt');
        return $this->startVerification($signup->refresh());
    }

    /** Página de status para onde o usuário volta; consulta a API (recupera webhook perdido). */
    public function show(Signup $signup)
    {
        $this->confirm($signup);
        return view('signup.status', ['signup' => $signup->refresh()]);
    }

    /**
     * Efeito de negócio aplicado UMA vez: só ativa se a API confirmar "verified",
     * a reference for deste cadastro e o telefone for o informado.
     */
    public function confirm(Signup $signup): void
    {
        if ($signup->status === 'active' || !$signup->verification_id) {
            return;
        }
        $v = $this->simvio->getVerification($signup->verification_id);

        DB::transaction(function () use ($signup, $v) {
            $locked = Signup::whereKey($signup->id)->lockForUpdate()->first();
            if ($locked->status === 'active' || $locked->verification_id !== $v['id']) {
                return;
            }
            if ($v['status'] === 'verified' && $v['reference'] === $locked->id && $v['phone_number'] === $locked->phone) {
                $locked->update(['status' => 'active', 'activated_at' => now()]);
            } elseif (in_array($v['status'], ['expired', 'cancelled', 'failed'], true)) {
                $locked->update(['status' => 'verification_' . $v['status']]);
            }
        });
    }

    private function startVerification(Signup $signup): RedirectResponse
    {
        try {
            $v = $this->simvio->createVerification(
                $signup->phone,
                $signup->id,
                // Estável por tentativa: repetir esta requisição devolve a mesma sessão.
                "{$signup->id}:{$signup->attempt}",
                route('signup.show', $signup),
            );
        } catch (RequestException $e) {
            $code = $e->response->json('error.code');
            $msg = match ($code) {
                'receiver_unavailable' => 'A confirmação por SMS está indisponível agora. Tente em alguns minutos.',
                'rate_limited' => 'Muitas tentativas para este número. Aguarde alguns minutos.',
                default => 'Não foi possível iniciar a confirmação. Tente novamente.',
            };
            return back()->withErrors(['phone' => $msg])->withInput();
        }

        $signup->update(['verification_id' => $v['id'], 'status' => 'pending_phone']);
        // Página hospedada da Simvio: mostra número, mensagem e botão para abrir o app de mensagens.
        return redirect()->away($v['verification_url']);
    }
}
