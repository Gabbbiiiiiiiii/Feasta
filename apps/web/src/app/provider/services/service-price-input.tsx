"use client";
import {useState} from "react";
import {Input} from "@/components/ui/input";
export function ServicePriceInput({value,onChange}: {value:string;onChange:(value:string,error?:string)=>void}) {
  const [focused,setFocused]=useState(false);
  const amount=Number(value);
  const display=!focused && value!=="" && Number.isFinite(amount) && amount<=9999999
    ? amount.toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2}):value;
  return <Input type="text" inputMode="decimal" autoComplete="off" value={display}
    className="aria-invalid:focus-visible:border-red-600 aria-invalid:focus-visible:ring-red-500/20"
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    onKeyDown={(event) => {
      if (!event.ctrlKey && !event.metaKey && ["e","E","+","-"].includes(event.key)) event.preventDefault();
    }}
    onChange={(event) => {
      const next=event.target.value;
      if (/^\d{0,7}(?:\.\d{0,2})?$/u.test(next) && (next==="" || next==="." || Number(next)<=9999999)) onChange(next);
      else onChange(value,"Use up to 7 integer digits and 2 decimal places. Exponents and signs are not allowed.");
    }} />;
}
