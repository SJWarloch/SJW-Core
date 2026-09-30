import { withSupabase } from 'npm:@supabase/server@^1'

export default {
    fetch: withSupabase(
        { auth: 'user' },

        async (req, ctx) => {

            if (req.method !== 'POST') {
                return Response.json(
                    { error: 'Method not allowed' },
                    { status: 405 }
                )
            }


            // ------------------------------------------------
            // Administrator authentication
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
            // Read input
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


            if (!Array.isArray(body.identifiers)) {
                return Response.json(
                    { error: 'identifiers must be an array' },
                    { status: 400 }
                )
            }


            const identifiers =
                body.identifiers
                    .filter(
                        (value: unknown) =>
                            typeof value === 'string'
                    )
                    .map(
                        (value: string) =>
                            value.trim()
                    )
                    .filter(
                        (value: string) =>
                            value.length > 0
                    )


            if (
                identifiers.length < 1 ||
                identifiers.length > 500
            ) {
                return Response.json(
                    {
                        error:
                            'Supply between 1 and 500 identifiers'
                    },
                    { status: 400 }
                )
            }


            // ------------------------------------------------
            // Exact username/email resolution
            // ------------------------------------------------

            const { data, error } =
                await ctx.supabaseAdmin.rpc(
                    'admin_resolve_users',
                    {
                        identifiers
                    }
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
                users: data ?? []
            })
        }
    )
}