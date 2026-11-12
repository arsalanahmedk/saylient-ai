# Use Cases

## UC-01 Analyze message
**Actor:** Authenticated user  
**Precondition:** User is signed in.  
**Main flow:** Enter message → optionally add context → choose goal/context → submit → view analysis → edit/copy/save draft.  
**Alternate:** If model provider fails, show an error or partial analysis; do not fabricate results.  
**Postcondition:** Analysis is returned; persistence follows disclosed user settings.

## UC-02 Manage history
**Actor:** Authenticated user  
**Main flow:** Open history → select own analysis → view or delete → confirm deletion.  
**Security:** Server verifies ownership on every operation.

## UC-03 Manage templates
**Actor:** Authenticated user  
**Main flow:** Create, edit, list and delete personal templates.  
**Security:** Templates are private to their owner.

## UC-04 Export/delete account
**Actor:** Authenticated user  
**Main flow:** Request export or deletion → re-authenticate/confirm as appropriate → process request → show status.  
**Postcondition:** Follow documented retention and backup expiry rules.
