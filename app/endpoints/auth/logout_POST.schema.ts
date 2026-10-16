import { z } from "zod";
import { supabase } from "../../helpers/supabaseClient";

// Browser-only: ends the Supabase Auth session.
export const schema = z.object({});
export type OutputType = { success: boolean; message: string } | { error: string; message?: string };

export const postLogout = async (): Promise<OutputType> => {
  const { error } = await supabase.auth.signOut();
  return error ? { error: error.message } : { success: true, message: "Signed out" };
};
