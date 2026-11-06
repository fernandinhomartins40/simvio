<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('signups', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('phone', 20);
            $table->string('status', 40);
            $table->unsignedSmallInteger('attempt')->default(1);
            $table->string('verification_id', 64)->nullable()->index();
            $table->timestamp('activated_at')->nullable();
            $table->timestamps();
        });

        Schema::create('simvio_processed_events', function (Blueprint $table) {
            $table->string('event_id', 64)->primary();
            $table->timestamp('received_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('simvio_processed_events');
        Schema::dropIfExists('signups');
    }
};
