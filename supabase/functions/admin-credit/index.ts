import { withSupabase } from 'npm:@supabase/server@^1'

type CreditTransaction = {
    user_id: string
    amount: number
    entry_type?: string
    source_reference?: string | null
    idempotency_key: string
    description?: string | null
}

export default {
    fetch: withSupabase(
        { auth: 'user' },

        async (req, ctx) => {

            // ------------------------------------------------
            // Only accept POST requests.
            // ------------------------------------------------

            if (req.method !== 'POST') {
                return Response.json(
                    { error: 'Method not allowed' },
                    { status: 405 }
                )
            }


            // ------------------------------------------------
            // Verify that the caller is the SJW administrator.
            // ------------------------------------------------

            const adminUserId =
                Deno.env.get('SJW_ADMIN_USER_ID')

            const callerUserId =
                ctx.userClaims?.id ??
                ctx.jwtClaims?.sub

            if (
                !adminUserId ||
                callerUserId !== adminUserId
            ) {
                return Response.json(
                    { error: 'Forbidden' },
                    { status: 403 }
                )
            }


            // ------------------------------------------------
            // Read the JSON request body.
            // ------------------------------------------------

            let body

            try {
                body = await req.json()
            } catch {
                return Response.json(
                    { error: 'Invalid JSON body' },
                    { status: 400 }
                )
            }


            // ------------------------------------------------
            // Accept either:
            //
            // { transaction }
            //
            // or:
            //
            // { transactions: [...] }
            //
            // ------------------------------------------------

            const transactions: CreditTransaction[] =
                Array.isArray(body.transactions)
                    ? body.transactions
                    : [body]


            if (
                transactions.length < 1 ||
                transactions.length > 500
            ) {
                return Response.json(
                    {
                        error:
                            'Request must contain between 1 and 500 transactions'
                    },
                    { status: 400 }
                )
            }


            // ------------------------------------------------
            // Validate and normalize every transaction.
            // ------------------------------------------------

            const rows = []

            for (const tx of transactions) {

                if (
                    typeof tx.user_id !== 'string' ||
                    tx.user_id.length === 0
                ) {
                    return Response.json(
                        { error: 'Every transaction needs a user_id' },
                        { status: 400 }
                    )
                }


                if (
                    !Number.isSafeInteger(tx.amount) ||
                    tx.amount === 0
                ) {
                    return Response.json(
                        {
                            error:
                                'Every amount must be a non-zero integer'
                        },
                        { status: 400 }
                    )
                }


                if (
                    typeof tx.idempotency_key !== 'string' ||
                    tx.idempotency_key.trim().length === 0
                ) {
                    return Response.json(
                        {
                            error:
                                'Every transaction needs an idempotency_key'
                        },
                        { status: 400 }
                    )
                }


                rows.push({
                    user_id: tx.user_id,
                    amount: tx.amount,

                    entry_type:
                        tx.entry_type ?? 'adjustment',

                    source:
                        'sjw_admin',

                    source_reference:
                        tx.source_reference ?? null,

                    idempotency_key:
                        tx.idempotency_key.trim(),

                    description:
                        tx.description ?? null
                })
            }


            // ------------------------------------------------
            // Privileged database operation.
            //
            // supabaseAdmin runs server-side and has permission
            // to insert ledger transactions.
            // ------------------------------------------------

            const { data, error } =
                await ctx.supabaseAdmin
                    .from('credit_ledger')
                    .insert(rows)
                    .select(
                        `
                        id,
                        user_id,
                        amount,
                        entry_type,
                        source,
                        source_reference,
                        idempotency_key,
                        description,
                        created_at
                        `
                    )


            if (error) {
                return Response.json(
                    {
                        error: error.message,
                        code: error.code
                    },
                    { status: 400 }
                )
            }


            return Response.json({
                success: true,
                inserted: data?.length ?? 0,
                entries: data
            })
        }
    )
}