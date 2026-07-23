-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'FEDERATION_ADMIN', 'REGION_ADMIN', 'CLUB_ADMIN', 'ARBITER', 'COACH', 'SCHOOL_TEACHER', 'PLAYER', 'PARENT', 'SPECTATOR');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "ChessTitle" AS ENUM ('GM', 'IM', 'FM', 'CM', 'WGM', 'WIM', 'WFM', 'WCM', 'NM');

-- CreateEnum
CREATE TYPE "TimeCategory" AS ENUM ('CLASSICAL', 'RAPID', 'BLITZ', 'BULLET');

-- CreateEnum
CREATE TYPE "PlayEnvironment" AS ENUM ('OTB', 'ONLINE');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PairingSystem" AS ENUM ('SWISS_DUTCH', 'ROUND_ROBIN', 'DOUBLE_ROUND_ROBIN', 'KNOCKOUT', 'SCHEVENINGEN', 'TEAM_SWISS');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('PENDING', 'PAIRING_IN_PROGRESS', 'PAIRING_FAILED', 'PAIRED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PairingResult" AS ENUM ('WHITE_WIN', 'BLACK_WIN', 'DRAW', 'WHITE_WIN_FORFEIT', 'BLACK_WIN_FORFEIT', 'DOUBLE_FORFEIT', 'BYE_FULL', 'BYE_HALF', 'BYE_ZERO', 'UNPLAYED');

-- CreateEnum
CREATE TYPE "Color" AS ENUM ('WHITE', 'BLACK');

-- CreateEnum
CREATE TYPE "OnlineGameStatus" AS ENUM ('PENDING', 'ACTIVE', 'CHECKMATE', 'STALEMATE', 'RESIGNATION', 'TIMEOUT', 'DRAW_AGREED', 'THREEFOLD_REPETITION', 'FIFTY_MOVE_RULE', 'INSUFFICIENT_MATERIAL', 'TIMEOUT_VS_INSUFFICIENT_MATERIAL', 'ABANDONED', 'ABORTED');

-- CreateEnum
CREATE TYPE "ClockType" AS ENUM ('SUDDEN_DEATH', 'FISCHER_INCREMENT', 'BRONSTEIN_DELAY', 'SIMPLE_DELAY', 'MULTI_STAGE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUND_REQUESTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('CLICK', 'PAYME', 'UZUM', 'BANK_TRANSFER', 'MANUAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "FairPlayCaseStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'CLOSED_NO_ACTION', 'CLOSED_WARNING', 'CLOSED_SANCTION', 'APPEALED');

-- CreateEnum
CREATE TYPE "FairPlaySignalType" AS ENUM ('ENGINE_CORRELATION', 'TIMING_ANOMALY', 'RATING_JUMP', 'BROWSER_FOCUS_LOSS', 'DEVICE_FINGERPRINT', 'MULTI_ACCOUNT', 'MANUAL_REPORT');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'UPHELD', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'PUSH', 'TELEGRAM', 'EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "password_hash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "totp_secret" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "totp_backup_codes" TEXT[],
    "locale" TEXT NOT NULL DEFAULT 'uz-Latn',
    "last_login_at" TIMESTAMPTZ(3),
    "last_login_ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "scope_type" TEXT,
    "scope_id" UUID,
    "granted_by" UUID,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_links" (
    "id" UUID NOT NULL,
    "parent_user_id" UUID NOT NULL,
    "child_player_id" UUID NOT NULL,
    "consent_given_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "parent_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "full_name_cyrl" TEXT,
    "birth_date" DATE,
    "gender" "Gender",
    "avatar_url" TEXT,
    "fide_id" TEXT,
    "title" "ChessTitle",
    "federation_id" UUID,
    "region_id" UUID,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "federations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "logo_url" TEXT,
    "website" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "federations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" UUID NOT NULL,
    "federation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "soato_code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clubs" (
    "id" UUID NOT NULL,
    "region_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo_url" TEXT,
    "address" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_memberships" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "club_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "federation_id" UUID,
    "region_id" UUID,
    "club_id" UUID,
    "organizer_id" UUID NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "venue_name" TEXT,
    "address" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "start_date" TIMESTAMPTZ(3) NOT NULL,
    "end_date" TIMESTAMPTZ(3) NOT NULL,
    "registration_opens_at" TIMESTAMPTZ(3),
    "registration_closes_at" TIMESTAMPTZ(3),
    "entry_fee_amount" BIGINT,
    "entry_fee_currency" TEXT NOT NULL DEFAULT 'UZS',
    "is_fide_rated" BOOLEAN NOT NULL DEFAULT false,
    "is_nationally_rated" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_sections" (
    "id" UUID NOT NULL,
    "tournament_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "pairingSystem" "PairingSystem" NOT NULL DEFAULT 'SWISS_DUTCH',
    "timeCategory" "TimeCategory" NOT NULL,
    "environment" "PlayEnvironment" NOT NULL DEFAULT 'OTB',
    "total_rounds" INTEGER NOT NULL,
    "clock_type" "ClockType" NOT NULL,
    "base_time_seconds" INTEGER NOT NULL,
    "increment_seconds" INTEGER NOT NULL DEFAULT 0,
    "multi_stage_config" JSONB,
    "min_rating" INTEGER,
    "max_rating" INTEGER,
    "min_birth_year" INTEGER,
    "max_birth_year" INTEGER,
    "gender_restriction" "Gender",
    "max_players" INTEGER,
    "tie_break_order" TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tournament_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_arbiters" (
    "id" UUID NOT NULL,
    "tournament_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_chief" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tournament_arbiters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "pairing_number" INTEGER,
    "rating_at_entry" INTEGER,
    "title_at_entry" "ChessTitle",
    "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "is_withdrawn" BOOLEAN NOT NULL DEFAULT false,
    "withdrawn_at" TIMESTAMPTZ(3),
    "withdrawn_reason" TEXT,
    "joined_at_round" INTEGER,
    "invoice_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "RoundStatus" NOT NULL DEFAULT 'PENDING',
    "scheduled_start_at" TIMESTAMPTZ(3),
    "actual_start_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "pairing_engine_version" TEXT,
    "pairing_failure_reason" TEXT,
    "pairing_computed_at" TIMESTAMPTZ(3),
    "pairing_duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pairings" (
    "id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "board_number" INTEGER NOT NULL,
    "white_registration_id" UUID NOT NULL,
    "black_registration_id" UUID,
    "result" "PairingResult" NOT NULL DEFAULT 'UNPLAYED',
    "result_entered_by" UUID,
    "result_entered_at" TIMESTAMPTZ(3),
    "pgn" TEXT,
    "online_game_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pairings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standings" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "points" DECIMAL(4,1) NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "tie_break_values" JSONB NOT NULL DEFAULT '{}',
    "games_played" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "color_history" TEXT[],
    "float_history" TEXT[],
    "performance_rating" INTEGER,
    "computed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "standings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_ratings" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "environment" "PlayEnvironment" NOT NULL,
    "timeCategory" "TimeCategory" NOT NULL,
    "rating" DECIMAL(8,4) NOT NULL DEFAULT 1500,
    "deviation" DECIMAL(8,4) NOT NULL DEFAULT 350,
    "volatility" DECIMAL(10,8) NOT NULL DEFAULT 0.06,
    "games_played" INTEGER NOT NULL DEFAULT 0,
    "is_provisional" BOOLEAN NOT NULL DEFAULT true,
    "peak_rating" INTEGER,
    "peak_rating_at" TIMESTAMPTZ(3),
    "last_period_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "player_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_periods" (
    "id" UUID NOT NULL,
    "environment" "PlayEnvironment" NOT NULL,
    "timeCategory" "TimeCategory" NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "tau" DECIMAL(4,3) NOT NULL,
    "computed_at" TIMESTAMPTZ(3),
    "players_affected" INTEGER,
    "games_processed" INTEGER,
    "recompute_generation" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rating_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_history" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "environment" "PlayEnvironment" NOT NULL,
    "timeCategory" "TimeCategory" NOT NULL,
    "rating_before" DECIMAL(8,4) NOT NULL,
    "deviation_before" DECIMAL(8,4) NOT NULL,
    "volatility_before" DECIMAL(10,8) NOT NULL,
    "rating_after" DECIMAL(8,4) NOT NULL,
    "deviation_after" DECIMAL(8,4) NOT NULL,
    "volatility_after" DECIMAL(10,8) NOT NULL,
    "games_in_period" INTEGER NOT NULL,
    "input_games" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rating_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fide_rating_snapshots" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "list_date" DATE NOT NULL,
    "standard_rating" INTEGER,
    "rapid_rating" INTEGER,
    "blitz_rating" INTEGER,
    "standard_games" INTEGER,
    "rapid_games" INTEGER,
    "blitz_games" INTEGER,
    "title" "ChessTitle",
    "synced_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fide_rating_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_games" (
    "id" UUID NOT NULL,
    "white_player_id" UUID NOT NULL,
    "black_player_id" UUID NOT NULL,
    "status" "OnlineGameStatus" NOT NULL DEFAULT 'PENDING',
    "time_category" "TimeCategory" NOT NULL,
    "clock_type" "ClockType" NOT NULL,
    "base_time_seconds" INTEGER NOT NULL,
    "increment_seconds" INTEGER NOT NULL DEFAULT 0,
    "fen" TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    "pgn" TEXT,
    "winner_color" "Color",
    "white_time_left_ms" INTEGER,
    "black_time_left_ms" INTEGER,
    "is_rated" BOOLEAN NOT NULL DEFAULT true,
    "started_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "online_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moves" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "ply" INTEGER NOT NULL,
    "san" TEXT NOT NULL,
    "uci" TEXT NOT NULL,
    "fen_after" TEXT NOT NULL,
    "position_hash" TEXT NOT NULL,
    "think_time_ms" INTEGER,
    "clock_after_ms" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fair_play_reports" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "top_move_match_rate" DECIMAL(5,4),
    "avg_centipawn_loss" DECIMAL(8,2),
    "timing_variance" DECIMAL(10,4),
    "suspicion_score" DECIMAL(5,4),
    "engine_name" TEXT,
    "engine_depth" INTEGER,
    "analysis_ms" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fair_play_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fair_play_signals" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "type" "FairPlaySignalType" NOT NULL,
    "strength" DECIMAL(5,4) NOT NULL,
    "evidence" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fair_play_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fair_play_cases" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "status" "FairPlayCaseStatus" NOT NULL DEFAULT 'OPEN',
    "aggregate_score" DECIMAL(5,4),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "decision_rationale" TEXT,
    "sanction_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fair_play_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeals" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "fair_play_case_id" UUID,
    "status" "AppealStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reason" TEXT NOT NULL,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "decision" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puzzles" (
    "id" UUID NOT NULL,
    "fen" TEXT NOT NULL,
    "solution" TEXT[],
    "rating" DECIMAL(8,4) NOT NULL DEFAULT 1500,
    "deviation" DECIMAL(8,4) NOT NULL DEFAULT 350,
    "themes" TEXT[],
    "source_game_id" TEXT,
    "source_url" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "solve_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "puzzles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puzzle_attempts" (
    "id" UUID NOT NULL,
    "puzzle_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "is_solved" BOOLEAN NOT NULL,
    "time_spent_ms" INTEGER NOT NULL,
    "wrong_moves" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "puzzle_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaches" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "bio" TEXT,
    "languages" TEXT[],
    "hourly_rate_amount" BIGINT,
    "hourly_rate_currency" TEXT NOT NULL DEFAULT 'UZS',
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "coaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "coach_id" UUID NOT NULL,
    "student_player_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "price_amount" BIGINT NOT NULL,
    "price_currency" TEXT NOT NULL DEFAULT 'UZS',
    "invoice_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "id" UUID NOT NULL,
    "region_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_classes" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "academic_year" TEXT NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "school_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "enrolled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "club_id" UUID,
    "school_id" UUID,
    "plan" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "price_amount" BIGINT NOT NULL,
    "price_currency" TEXT NOT NULL DEFAULT 'UZS',
    "billing_cycle" TEXT NOT NULL,
    "current_period_start" TIMESTAMPTZ(3) NOT NULL,
    "current_period_end" TIMESTAMPTZ(3) NOT NULL,
    "trial_ends_at" TIMESTAMPTZ(3),
    "grace_period_ends_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "user_id" UUID,
    "subscription_id" UUID,
    "tournament_id" UUID,
    "subtotal_amount" BIGINT NOT NULL,
    "tax_amount" BIGINT NOT NULL DEFAULT 0,
    "total_amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "due_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "provider_transaction_id" TEXT,
    "provider_payload" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "failure_reason" TEXT,
    "paid_at" TIMESTAMPTZ(3),
    "refunded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "payment_id" UUID,
    "account" TEXT NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "template_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sent_at" TIMESTAMPTZ(3),
    "read_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "trace_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "rollout_percentage" INTEGER NOT NULL DEFAULT 0,
    "enabled_for_user_ids" TEXT[],
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_scope_type_scope_id_idx" ON "user_roles"("scope_type", "scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_scope_type_scope_id_key" ON "user_roles"("user_id", "role", "scope_type", "scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_provider_user_id_key" ON "oauth_accounts"("provider", "provider_user_id");

-- CreateIndex
CREATE INDEX "parent_links_child_player_id_idx" ON "parent_links"("child_player_id");

-- CreateIndex
CREATE UNIQUE INDEX "parent_links_parent_user_id_child_player_id_key" ON "parent_links"("parent_user_id", "child_player_id");

-- CreateIndex
CREATE UNIQUE INDEX "players_user_id_key" ON "players"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "players_fide_id_key" ON "players"("fide_id");

-- CreateIndex
CREATE INDEX "players_last_name_first_name_idx" ON "players"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "players_federation_id_idx" ON "players"("federation_id");

-- CreateIndex
CREATE INDEX "players_region_id_idx" ON "players"("region_id");

-- CreateIndex
CREATE INDEX "players_fide_id_idx" ON "players"("fide_id");

-- CreateIndex
CREATE UNIQUE INDEX "federations_country_code_key" ON "federations"("country_code");

-- CreateIndex
CREATE UNIQUE INDEX "regions_soato_code_key" ON "regions"("soato_code");

-- CreateIndex
CREATE INDEX "regions_federation_id_idx" ON "regions"("federation_id");

-- CreateIndex
CREATE UNIQUE INDEX "clubs_slug_key" ON "clubs"("slug");

-- CreateIndex
CREATE INDEX "clubs_region_id_idx" ON "clubs"("region_id");

-- CreateIndex
CREATE INDEX "club_memberships_player_id_idx" ON "club_memberships"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "club_memberships_club_id_player_id_joined_at_key" ON "club_memberships"("club_id", "player_id", "joined_at");

-- CreateIndex
CREATE UNIQUE INDEX "tournaments_slug_key" ON "tournaments"("slug");

-- CreateIndex
CREATE INDEX "tournaments_status_start_date_idx" ON "tournaments"("status", "start_date");

-- CreateIndex
CREATE INDEX "tournaments_region_id_idx" ON "tournaments"("region_id");

-- CreateIndex
CREATE INDEX "tournaments_club_id_idx" ON "tournaments"("club_id");

-- CreateIndex
CREATE INDEX "tournaments_slug_idx" ON "tournaments"("slug");

-- CreateIndex
CREATE INDEX "tournament_sections_tournament_id_idx" ON "tournament_sections"("tournament_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_sections_tournament_id_name_key" ON "tournament_sections"("tournament_id", "name");

-- CreateIndex
CREATE INDEX "tournament_arbiters_user_id_idx" ON "tournament_arbiters"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_arbiters_tournament_id_user_id_key" ON "tournament_arbiters"("tournament_id", "user_id");

-- CreateIndex
CREATE INDEX "registrations_player_id_idx" ON "registrations"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_section_id_player_id_key" ON "registrations"("section_id", "player_id");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_section_id_pairing_number_key" ON "registrations"("section_id", "pairing_number");

-- CreateIndex
CREATE INDEX "rounds_section_id_idx" ON "rounds"("section_id");

-- CreateIndex
CREATE UNIQUE INDEX "rounds_section_id_number_key" ON "rounds"("section_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "pairings_online_game_id_key" ON "pairings"("online_game_id");

-- CreateIndex
CREATE INDEX "pairings_round_id_idx" ON "pairings"("round_id");

-- CreateIndex
CREATE INDEX "pairings_white_registration_id_idx" ON "pairings"("white_registration_id");

-- CreateIndex
CREATE INDEX "pairings_black_registration_id_idx" ON "pairings"("black_registration_id");

-- CreateIndex
CREATE UNIQUE INDEX "pairings_round_id_board_number_key" ON "pairings"("round_id", "board_number");

-- CreateIndex
CREATE UNIQUE INDEX "standings_registration_id_key" ON "standings"("registration_id");

-- CreateIndex
CREATE INDEX "standings_section_id_rank_idx" ON "standings"("section_id", "rank");

-- CreateIndex
CREATE INDEX "player_ratings_environment_timeCategory_rating_idx" ON "player_ratings"("environment", "timeCategory", "rating" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "player_ratings_player_id_environment_timeCategory_key" ON "player_ratings"("player_id", "environment", "timeCategory");

-- CreateIndex
CREATE INDEX "rating_periods_computed_at_idx" ON "rating_periods"("computed_at");

-- CreateIndex
CREATE UNIQUE INDEX "rating_periods_environment_timeCategory_starts_at_key" ON "rating_periods"("environment", "timeCategory", "starts_at");

-- CreateIndex
CREATE INDEX "rating_history_player_id_created_at_idx" ON "rating_history"("player_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "rating_history_player_id_period_id_environment_timeCategory_key" ON "rating_history"("player_id", "period_id", "environment", "timeCategory");

-- CreateIndex
CREATE INDEX "fide_rating_snapshots_list_date_idx" ON "fide_rating_snapshots"("list_date");

-- CreateIndex
CREATE UNIQUE INDEX "fide_rating_snapshots_player_id_list_date_key" ON "fide_rating_snapshots"("player_id", "list_date");

-- CreateIndex
CREATE INDEX "online_games_white_player_id_idx" ON "online_games"("white_player_id");

-- CreateIndex
CREATE INDEX "online_games_black_player_id_idx" ON "online_games"("black_player_id");

-- CreateIndex
CREATE INDEX "online_games_status_idx" ON "online_games"("status");

-- CreateIndex
CREATE INDEX "online_games_created_at_idx" ON "online_games"("created_at");

-- CreateIndex
CREATE INDEX "moves_game_id_idx" ON "moves"("game_id");

-- CreateIndex
CREATE INDEX "moves_position_hash_idx" ON "moves"("position_hash");

-- CreateIndex
CREATE UNIQUE INDEX "moves_game_id_ply_key" ON "moves"("game_id", "ply");

-- CreateIndex
CREATE INDEX "fair_play_reports_suspicion_score_idx" ON "fair_play_reports"("suspicion_score");

-- CreateIndex
CREATE UNIQUE INDEX "fair_play_reports_game_id_player_id_key" ON "fair_play_reports"("game_id", "player_id");

-- CreateIndex
CREATE INDEX "fair_play_signals_case_id_idx" ON "fair_play_signals"("case_id");

-- CreateIndex
CREATE INDEX "fair_play_cases_player_id_idx" ON "fair_play_cases"("player_id");

-- CreateIndex
CREATE INDEX "fair_play_cases_status_idx" ON "fair_play_cases"("status");

-- CreateIndex
CREATE INDEX "appeals_player_id_idx" ON "appeals"("player_id");

-- CreateIndex
CREATE INDEX "appeals_subject_type_subject_id_idx" ON "appeals"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "appeals_status_idx" ON "appeals"("status");

-- CreateIndex
CREATE INDEX "puzzles_rating_idx" ON "puzzles"("rating");

-- CreateIndex
CREATE INDEX "puzzles_themes_idx" ON "puzzles" USING GIN ("themes");

-- CreateIndex
CREATE INDEX "puzzle_attempts_player_id_created_at_idx" ON "puzzle_attempts"("player_id", "created_at");

-- CreateIndex
CREATE INDEX "puzzle_attempts_puzzle_id_idx" ON "puzzle_attempts"("puzzle_id");

-- CreateIndex
CREATE UNIQUE INDEX "coaches_player_id_key" ON "coaches"("player_id");

-- CreateIndex
CREATE INDEX "lessons_coach_id_scheduled_at_idx" ON "lessons"("coach_id", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "schools_code_key" ON "schools"("code");

-- CreateIndex
CREATE INDEX "schools_region_id_idx" ON "schools"("region_id");

-- CreateIndex
CREATE INDEX "school_classes_teacher_user_id_idx" ON "school_classes"("teacher_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_classes_school_id_name_academic_year_key" ON "school_classes"("school_id", "name", "academic_year");

-- CreateIndex
CREATE UNIQUE INDEX "students_player_id_key" ON "students"("player_id");

-- CreateIndex
CREATE INDEX "students_class_id_idx" ON "students"("class_id");

-- CreateIndex
CREATE INDEX "subscriptions_club_id_idx" ON "subscriptions"("club_id");

-- CreateIndex
CREATE INDEX "subscriptions_school_id_idx" ON "subscriptions"("school_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_current_period_end_idx" ON "subscriptions"("status", "current_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_user_id_idx" ON "invoices"("user_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_created_at_idx" ON "invoices"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_transaction_id_key" ON "payments"("provider", "provider_transaction_id");

-- CreateIndex
CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries"("transaction_id");

-- CreateIndex
CREATE INDEX "ledger_entries_account_created_at_idx" ON "ledger_entries"("account", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_payment_id_idx" ON "ledger_entries"("payment_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_sent_at_idx" ON "notifications"("sent_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_child_player_id_fkey" FOREIGN KEY ("child_player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_federation_id_fkey" FOREIGN KEY ("federation_id") REFERENCES "federations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regions" ADD CONSTRAINT "regions_federation_id_fkey" FOREIGN KEY ("federation_id") REFERENCES "federations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_federation_id_fkey" FOREIGN KEY ("federation_id") REFERENCES "federations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_sections" ADD CONSTRAINT "tournament_sections_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_arbiters" ADD CONSTRAINT "tournament_arbiters_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "tournament_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "tournament_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pairings" ADD CONSTRAINT "pairings_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pairings" ADD CONSTRAINT "pairings_white_registration_id_fkey" FOREIGN KEY ("white_registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pairings" ADD CONSTRAINT "pairings_black_registration_id_fkey" FOREIGN KEY ("black_registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pairings" ADD CONSTRAINT "pairings_online_game_id_fkey" FOREIGN KEY ("online_game_id") REFERENCES "online_games"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standings" ADD CONSTRAINT "standings_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "tournament_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standings" ADD CONSTRAINT "standings_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_ratings" ADD CONSTRAINT "player_ratings_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "rating_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fide_rating_snapshots" ADD CONSTRAINT "fide_rating_snapshots_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_games" ADD CONSTRAINT "online_games_white_player_id_fkey" FOREIGN KEY ("white_player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_games" ADD CONSTRAINT "online_games_black_player_id_fkey" FOREIGN KEY ("black_player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "online_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fair_play_reports" ADD CONSTRAINT "fair_play_reports_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "online_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fair_play_signals" ADD CONSTRAINT "fair_play_signals_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "fair_play_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fair_play_cases" ADD CONSTRAINT "fair_play_cases_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_fair_play_case_id_fkey" FOREIGN KEY ("fair_play_case_id") REFERENCES "fair_play_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzle_attempts" ADD CONSTRAINT "puzzle_attempts_puzzle_id_fkey" FOREIGN KEY ("puzzle_id") REFERENCES "puzzles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzle_attempts" ADD CONSTRAINT "puzzle_attempts_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_classes" ADD CONSTRAINT "school_classes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "school_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

