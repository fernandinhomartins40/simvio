<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Signup extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = ['id', 'name', 'phone', 'status', 'attempt', 'verification_id', 'activated_at'];
    protected $casts = ['activated_at' => 'datetime'];
}
