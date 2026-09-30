import { withSupabase } from 'npm:@supabase/server@^1'

export default {
    fetch: withSupabase(
        { auth: 'user' },

        async (req, ctx) => {

            // -----------------------------------------------
            // Only accept POST requests.
            // -----------------------------------------------

            if (req.method !== 'POST') {
                return Response.json(
                    { error: 'Method not allowed' },
                    { status: 405 }
                )
            }


            // -----------------------------------------------
            // Verify administrator.
            // -----------------------------------------------

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


            // -----------------------------------------------
            // Read request.
            // -----------------------------------------------

            let body

            try {
                body = await req.json()
            } catch {
                return Response.json(
                    { error: 'Invalid JSON body' },
                    { status: 400 }
                )
            }


            const searchTerm =
                typeof body.search_term === 'string'
                    ? body.search_term.trim()
                    : ''


            if (searchTerm.length < 2) {
                return Response.json(
                    {
                        error:
                            'Search term must contain at least 2 characters'
                    },
                    { status: 400 }
                )
            }


            // -----------------------------------------------
            // Ask PostgreSQL to perform the privileged search.
            // -----------------------------------------------

            const { data, error } =
                await ctx.supabaseAdmin.rpc(
                    'admin_search_users',
                    {
                        search_term: searchTerm
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