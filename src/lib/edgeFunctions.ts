import { supabase } from "@/integrations/supabase/client";

/** Invoke a Supabase edge function and surface error messages from the response body. */
export async function invokeEdgeFunction<T = unknown>(
  name: string,
  options?: { body?: Record<string, unknown> | FormData },
): Promise<T> {
  const { data, error, response } = await supabase.functions.invoke(name, options);

  if (error) {
    let message = error.message || `Edge function "${name}" failed`;
    if (response) {
      try {
        const body = await response.clone().json();
        if (body?.error) message = String(body.error);
      } catch {
        /* ignore parse errors */
      }
    }
    throw new Error(message);
  }

  if (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) {
    throw new Error(String((data as { error: string }).error));
  }

  return data as T;
}
