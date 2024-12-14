import { db } from "@/db";
import { stripe } from "@/lib/stripe";
import { ok } from "assert";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Result } from "postcss";
import Stripe from "stripe";

async function POST(req: Request){
  try{
    const body = await req.text();
    const signature = headers().get("stripe-signature")

    if(!signature){
      return new Response("Invalid signature", {status: 400})
    }

    const event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)

    if(event.type === "checkout.session.async_payment_succeeded"){
      if(!event.data.object.customer_email){
        return new Error("Missing customer email.")
      }

      const session = event.data.object as Stripe.Checkout.Session;

      const {userId, orderId} = session.metadata || {
        userId: null,
        orderId: null
      }

      if(!userId || !orderId){
        return new Error("Invalid request metadata.")
      }

      const billingAddress = session.customer_details!.address
      const shippingAddress = session.shipping_details!.address

      await db.order.update({
        where: {id: orderId},
        data: {
          isPaid: true,
          shippingAddress:{
            create:{
              name: session.customer_details!.name!,
              city: shippingAddress!.city!,
              country: shippingAddress!.country!,
              postalCode: shippingAddress!.postal_code!,
              street: shippingAddress!.line1!,
              state: shippingAddress!.state!
            }
          },
          billingAddress:{
            create:{
              name: session.customer_details!.name!,
              city: billingAddress!.city!,
              country: billingAddress!.country!,
              postalCode: billingAddress!.postal_code!,
              street: billingAddress!.line1!,
              state: billingAddress!.state!
            }
          }
        }
      })
    }
    return NextResponse.json({Result: event, ok: true})
  }catch(err){
    console.log(err)

    return NextResponse.json({message: "Something webt wrong", ok: false}, {status: 500})
  }
}