create or replace function public.normalize_phone(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(p,''), '\D', '', 'g');
begin
  if d like '00%' then d := substr(d, 3); end if;
  if d like '54%' and length(d) > 10 then d := substr(d, 3); end if;
  if d like '9%' and length(d) = 11 then d := substr(d, 2); end if;
  if d like '0%' then d := substr(d, 2); end if;
  -- quita el "15" de celulares: característica de 3, 2 o 4 dígitos + 15 + número
  if length(d) = 12 then
    if substr(d, 4, 2) = '15' then d := substr(d,1,3) || substr(d,6);
    elsif substr(d, 3, 2) = '15' then d := substr(d,1,2) || substr(d,5);
    elsif substr(d, 5, 2) = '15' then d := substr(d,1,4) || substr(d,7);
    end if;
  end if;
  if length(d) < 8 or length(d) > 13 then return null; end if;
  return d;
end $$;
revoke execute on function public.normalize_phone(text) from public, anon;
grant execute on function public.normalize_phone(text) to authenticated;
