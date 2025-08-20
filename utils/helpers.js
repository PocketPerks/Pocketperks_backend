const prisma = require("../prisma/client");

const ROOM = (ticketId) => `ticket_${ticketId}`;

async function getTicketOr404(res, ticket_id) {
  const id = Number(ticket_id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ success: false, error: "Invalid ticket_id" });
    return null;
  }
  const ticket = await prisma.support_tickets.findUnique({ where: { ticket_id: id } });
  if (!ticket) {
    res.status(404).json({ success: false, error: "Ticket not found" });
    return null;
  }
  return ticket;
}

module.exports = {
    ROOM,
    getTicketOr404,
};