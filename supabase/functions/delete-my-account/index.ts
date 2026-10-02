import { withSupabase } from 'npm:@supabase/server@^1'

export default {
    fetch: withSupabase(
        { auth: 'user' },

        async (req, ctx) => {

            // ------------------------------------------------
            // Only POST may delete an account.
            // ------------------------------------------------

            if (req.method !== 'POST') {

                return Response.json(
                    {
                        error:
                            'Method not allowed'
                    },
                    {
                        status: 405
                    }
                )
            }


            // ------------------------------------------------
            // Identify the authenticated caller.
            //
            // IMPORTANT:
            // The client does NOT supply a user ID.
            //
            // This means Alice cannot alter the request and ask
            // this function to delete Bob.
            // ------------------------------------------------

            const callerUserId =
                ctx.userClaims?.id ??
                ctx.jwtClaims?.sub


            if (!callerUserId) {

                return Response.json(
                    {
                        error:
                            'Authenticated user not found'
                    },
                    {
                        status: 401
                    }
                )
            }


            // ------------------------------------------------
            // HARD DELETE the current authenticated user.
            //
            // shouldSoftDelete = false
            //
            // Existing foreign-key cascades then remove:
            //
            // auth user
            //   -> profile
            //   -> Credit ledger
            //   -> sessions / identities
            //   -> temporary linking intents
            // ------------------------------------------------

            const { error } =
                await ctx.supabaseAdmin
                    .auth
                    .admin
                    .deleteUser(
                        callerUserId,
                        false
                    )


            if (error) {

                return Response.json(
                    {
                        error:
                            error.message
                    },
                    {
                        status: 400
                    }
                )
            }


            return Response.json({
                success: true
            })
        }
    )
}