<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Status do cadastro</title>
</head>
<body style="font-family:system-ui;max-width:480px;margin:40px auto;padding:0 16px">
  @if ($signup->status === 'active')
    <h1>Cadastro confirmado</h1>
    <p>Seu número foi confirmado. Você já pode entrar.</p>
  @elseif ($signup->status === 'pending_phone')
    <h1>Aguardando confirmação</h1>
    <p>Ainda não recebemos a confirmação do SMS. Se você já enviou, aguarde alguns segundos e atualize a página.</p>
  @else
    <h1>Confirmação não concluída</h1>
    <p>O prazo terminou ou a confirmação foi interrompida.</p>
    <form method="post" action="{{ route('signup.retry', $signup) }}">
      @csrf
      <button>Tentar de novo</button>
    </form>
  @endif
</body>
</html>
