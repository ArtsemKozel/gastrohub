-- =============================================================
-- GastroHub – vollständiges Datenbankschema
-- Für Supabase (PostgreSQL) – alle 40 Tabellen
-- =============================================================

-- Aktiviere UUID-Erweiterung (in Supabase standardmäßig aktiv)
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- MITARBEITER & ORGANISATION
-- =============================================================

CREATE TABLE IF NOT EXISTS planit_restaurants (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid NOT NULL,
    name        text,
    street      text,
    zip         text,
    city        text,
    hygiene_link_erst       text,
    hygiene_link_erneuerung text,
    created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS planit_departments (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid NOT NULL,
    name        text NOT NULL,
    created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees_planit (
    id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                 uuid NOT NULL,
    name                    text NOT NULL,
    login_code              text,
    department              text,
    is_active               boolean DEFAULT true,
    birthdate               date,
    is_apprentice           boolean DEFAULT false,
    start_date              date,
    hours_per_vacation_day  numeric DEFAULT 8,
    vacation_days_per_year  numeric DEFAULT 20,
    employment_type         text,
    wage_type               text,
    hourly_rate             numeric DEFAULT 0,
    hygiene_erste           date,
    hygiene_letzte          date,
    hygiene_gueltig_monate  integer DEFAULT 12,
    can_do_timeclock        boolean DEFAULT false,
    can_do_temperature      boolean DEFAULT false,
    can_do_inventory        boolean DEFAULT false,
    created_at              timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employment_phases (
    id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                 uuid NOT NULL,
    employee_id             uuid REFERENCES employees_planit(id) ON DELETE CASCADE,
    start_date              date NOT NULL,
    end_date                date,
    hours_per_vacation_day  numeric DEFAULT 8,
    vacation_days_per_year  numeric DEFAULT 20,
    employment_type         text,
    wage_type               text,
    hourly_rate             numeric DEFAULT 0,
    notes                   text,
    created_at              timestamptz DEFAULT now()
);

-- =============================================================
-- SCHICHTEN & PLANUNG
-- =============================================================

CREATE TABLE IF NOT EXISTS shift_templates (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    name            text,
    start_time      time,
    end_time        time,
    break_minutes   integer DEFAULT 0,
    department      text,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shifts (
    id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id               uuid NOT NULL,
    employee_id           uuid REFERENCES employees_planit(id) ON DELETE SET NULL,
    shift_date            date NOT NULL,
    start_time            time NOT NULL,
    end_time              time NOT NULL,
    break_minutes         integer DEFAULT 0,
    actual_start_time     time,
    actual_end_time       time,
    actual_break_minutes  integer,
    is_open               boolean DEFAULT false,
    is_unplanned          boolean DEFAULT false,
    department            text,
    open_note             text,
    notes                 text,
    created_at            timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS availability (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    employee_id     uuid REFERENCES employees_planit(id) ON DELETE CASCADE,
    month           date NOT NULL,
    available_days  jsonb,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shift_swaps (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             uuid NOT NULL,
    from_employee_id    uuid REFERENCES employees_planit(id) ON DELETE CASCADE,
    from_shift_id       uuid REFERENCES shifts(id) ON DELETE CASCADE,
    to_employee_id      uuid REFERENCES employees_planit(id) ON DELETE SET NULL,
    to_shift_id         uuid REFERENCES shifts(id) ON DELETE SET NULL,
    status              text DEFAULT 'pending',
    created_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shift_handovers (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             uuid NOT NULL,
    shift_id            uuid REFERENCES shifts(id) ON DELETE CASCADE,
    from_employee_id    uuid REFERENCES employees_planit(id) ON DELETE SET NULL,
    to_employee_id      uuid REFERENCES employees_planit(id) ON DELETE SET NULL,
    shift_date          date,
    start_time          time,
    end_time            time,
    department          text,
    status              text DEFAULT 'pending',
    created_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS open_shift_requests (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    employee_id     uuid REFERENCES employees_planit(id) ON DELETE CASCADE,
    shift_id        uuid REFERENCES shifts(id) ON DELETE CASCADE,
    status          text DEFAULT 'pending',
    created_at      timestamptz DEFAULT now()
);

-- =============================================================
-- ABWESENHEITEN
-- =============================================================

CREATE TABLE IF NOT EXISTS sick_leaves (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    employee_id     uuid REFERENCES employees_planit(id) ON DELETE CASCADE,
    start_date      date NOT NULL,
    end_date        date NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vacation_requests (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             uuid NOT NULL,
    employee_id         uuid REFERENCES employees_planit(id) ON DELETE CASCADE,
    type                text DEFAULT 'vacation',
    start_date          date,
    end_date            date,
    deducted_days       numeric DEFAULT 0,
    deducted_hours      numeric DEFAULT 0,
    status              text DEFAULT 'pending',
    reason              text,
    rejection_reason    text,
    pdf_url             text,
    payout_month        text,
    reviewed_at         timestamptz,
    reviewed_by         uuid,
    created_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS planit_terminations (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    employee_id     uuid REFERENCES employees_planit(id) ON DELETE CASCADE,
    requested_date  date,
    reason          text,
    status          text DEFAULT 'pending',
    approved_date   date,
    initiated_by    text DEFAULT 'employee',
    street          text,
    zip             text,
    city            text,
    pdf_url         text,
    created_at      timestamptz DEFAULT now()
);

-- =============================================================
-- ZEITERFASSUNG
-- =============================================================

CREATE TABLE IF NOT EXISTS gh_time_entries (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    employee_id     uuid REFERENCES employees_planit(id) ON DELETE CASCADE,
    shift_id        uuid REFERENCES shifts(id) ON DELETE SET NULL,
    clock_in        timestamptz NOT NULL,
    clock_out       timestamptz,
    is_manual       boolean DEFAULT false,
    note            text,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gh_breaks (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    employee_id     uuid REFERENCES employees_planit(id) ON DELETE CASCADE,
    time_entry_id   uuid REFERENCES gh_time_entries(id) ON DELETE CASCADE,
    break_start     timestamptz NOT NULL,
    break_end       timestamptz,
    created_at      timestamptz DEFAULT now()
);

-- =============================================================
-- STUNDEN & ABRECHNUNG
-- =============================================================

CREATE TABLE IF NOT EXISTS approved_hours (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             uuid NOT NULL,
    employee_id         uuid REFERENCES employees_planit(id) ON DELETE CASCADE,
    month               text NOT NULL,
    approved_minutes    integer DEFAULT 0,
    created_at          timestamptz DEFAULT now(),
    UNIQUE (user_id, employee_id, month)
);

CREATE TABLE IF NOT EXISTS actual_hours (
    id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                 uuid NOT NULL,
    employee_id             uuid REFERENCES employees_planit(id) ON DELETE CASCADE,
    month                   text NOT NULL,
    carry_over_minutes      integer DEFAULT 0,
    created_at              timestamptz DEFAULT now(),
    UNIQUE (user_id, employee_id, month)
);

CREATE TABLE IF NOT EXISTS planit_payrolls (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    period_start    date NOT NULL,
    period_end      date NOT NULL,
    data            jsonb,
    created_at      timestamptz DEFAULT now()
);

-- =============================================================
-- TRINKGELD
-- =============================================================

CREATE TABLE IF NOT EXISTS tip_config (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             uuid NOT NULL UNIQUE,
    mode                text DEFAULT 'pool',
    show_to_employees   boolean DEFAULT false,
    fixed_results       jsonb,
    created_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tip_departments (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             uuid NOT NULL,
    department          text NOT NULL,
    percentage          numeric DEFAULT 0,
    pool_department     boolean DEFAULT false,
    created_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tip_entries (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    entry_date      date NOT NULL,
    amount_card     numeric DEFAULT 0,
    amount_cash     numeric DEFAULT 0,
    created_at      timestamptz DEFAULT now(),
    UNIQUE (user_id, entry_date)
);

CREATE TABLE IF NOT EXISTS tip_hours (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    employee_id     uuid REFERENCES employees_planit(id) ON DELETE CASCADE,
    work_date       date NOT NULL,
    minutes         integer DEFAULT 0,
    department      text,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tip_results (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    employee_id     uuid REFERENCES employees_planit(id) ON DELETE CASCADE,
    month           text NOT NULL,
    amount_card     numeric DEFAULT 0,
    amount_cash     numeric DEFAULT 0,
    created_at      timestamptz DEFAULT now(),
    UNIQUE (user_id, employee_id, month)
);

-- =============================================================
-- INVENTUR
-- =============================================================

CREATE TABLE IF NOT EXISTS planit_suppliers (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid NOT NULL,
    name        text NOT NULL,
    sort_order  integer DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS planit_inventory_groups (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    supplier_id     uuid REFERENCES planit_suppliers(id) ON DELETE CASCADE,
    name            text NOT NULL,
    sort_order      integer DEFAULT 0,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS planit_inventory_items (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    supplier_id     uuid REFERENCES planit_suppliers(id) ON DELETE CASCADE,
    group_id        uuid REFERENCES planit_inventory_groups(id) ON DELETE SET NULL,
    name            text NOT NULL,
    unit            text,
    target_amount   numeric DEFAULT 0,
    price_per_unit  numeric DEFAULT 0,
    sort_order      integer DEFAULT 0,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS planit_inventory_entries (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    employee_id     uuid REFERENCES employees_planit(id) ON DELETE SET NULL,
    item_id         uuid REFERENCES planit_inventory_items(id) ON DELETE CASCADE,
    submission_id   uuid,
    entry_date      date NOT NULL,
    actual_amount   numeric DEFAULT 0,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS planit_inventory_submissions (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             uuid NOT NULL,
    employee_id         uuid REFERENCES employees_planit(id) ON DELETE SET NULL,
    supplier_id         uuid REFERENCES planit_suppliers(id) ON DELETE SET NULL,
    submission_date     date NOT NULL,
    seen                boolean DEFAULT false,
    submitted_at        timestamptz DEFAULT now()
);

-- FK von planit_inventory_entries zurück auf submissions
ALTER TABLE planit_inventory_entries
    ADD CONSTRAINT fk_inventory_entries_submission
    FOREIGN KEY (submission_id) REFERENCES planit_inventory_submissions(id) ON DELETE SET NULL;

-- =============================================================
-- TEMPERATURKONTROLLE
-- =============================================================

CREATE TABLE IF NOT EXISTS temperature_devices (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid NOT NULL,
    name        text NOT NULL,
    temp_min    numeric,
    temp_max    numeric,
    created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS temperature_logs (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    employee_id     uuid REFERENCES employees_planit(id) ON DELETE SET NULL,
    device_id       uuid REFERENCES temperature_devices(id) ON DELETE CASCADE,
    log_date        date NOT NULL,
    temperature     numeric,
    note            text,
    created_at      timestamptz DEFAULT now()
);

-- =============================================================
-- AUFGABEN
-- =============================================================

CREATE TABLE IF NOT EXISTS task_templates (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid NOT NULL,
    name        text NOT NULL,
    description text,
    created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_template_steps (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    template_id     uuid REFERENCES task_templates(id) ON DELETE CASCADE,
    title           text NOT NULL,
    position        integer DEFAULT 0,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    title           text NOT NULL,
    description     text,
    type            text DEFAULT 'general',
    due_date        date,
    repeat_interval text,
    repeat_every    integer,
    is_archived     boolean DEFAULT false,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_steps (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid NOT NULL,
    task_id     uuid REFERENCES tasks(id) ON DELETE CASCADE,
    title       text NOT NULL,
    position    integer DEFAULT 0,
    is_done     boolean DEFAULT false,
    created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_assignments (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    task_id         uuid REFERENCES tasks(id) ON DELETE CASCADE,
    employee_id     uuid REFERENCES employees_planit(id) ON DELETE CASCADE,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notes (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid NOT NULL,
    title       text NOT NULL,
    content     text,
    created_at  timestamptz DEFAULT now()
);

-- =============================================================
-- SPEISEKARTEN-KALKULATION
-- =============================================================

CREATE TABLE IF NOT EXISTS categories (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid NOT NULL,
    name        text NOT NULL,
    sort_order  integer DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid NOT NULL,
    name        text NOT NULL,
    created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingredients (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL,
    name            text NOT NULL,
    unit            text,
    price_per_unit  numeric DEFAULT 0,
    supplier_id     uuid REFERENCES suppliers(id) ON DELETE SET NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dishes (
    id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                 uuid NOT NULL,
    name                    text NOT NULL,
    category_id             uuid REFERENCES categories(id) ON DELETE SET NULL,
    food_cost_percentage    numeric,
    created_at              timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dish_ingredients (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    dish_id         uuid REFERENCES dishes(id) ON DELETE CASCADE,
    ingredient_id   uuid REFERENCES ingredients(id) ON DELETE CASCADE,
    amount          numeric DEFAULT 0,
    created_at      timestamptz DEFAULT now()
);

-- =============================================================
-- ROW LEVEL SECURITY (RLS)
-- Aktiviere RLS auf allen Tabellen und erlaube Zugriff nur
-- wenn user_id mit der eingeloggten auth.uid() übereinstimmt.
-- =============================================================

DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'planit_restaurants','planit_departments','employees_planit',
        'employment_phases','shift_templates','shifts','availability',
        'shift_swaps','shift_handovers','open_shift_requests',
        'sick_leaves','vacation_requests','planit_terminations',
        'gh_time_entries','gh_breaks',
        'approved_hours','actual_hours','planit_payrolls',
        'tip_config','tip_departments','tip_entries','tip_hours','tip_results',
        'planit_suppliers','planit_inventory_groups','planit_inventory_items',
        'planit_inventory_entries','planit_inventory_submissions',
        'temperature_devices','temperature_logs',
        'task_templates','task_template_steps','tasks','task_steps',
        'task_assignments','notes',
        'categories','suppliers','ingredients','dishes','dish_ingredients'
    ])
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);

        -- SELECT
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR SELECT USING (auth.uid() = user_id);',
            t || '_select', t
        );
        -- INSERT
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (auth.uid() = user_id);',
            t || '_insert', t
        );
        -- UPDATE
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR UPDATE USING (auth.uid() = user_id);',
            t || '_update', t
        );
        -- DELETE
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR DELETE USING (auth.uid() = user_id);',
            t || '_delete', t
        );
    END LOOP;
END $$;

-- dish_ingredients hat keine user_id – Zugriff über dishes erlauben
ALTER TABLE dish_ingredients DISABLE ROW LEVEL SECURITY;
