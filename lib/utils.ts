export function generateSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let slug = ''
  for (let i = 0; i < 8; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return slug
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInMs = now.getTime() - date.getTime()
  const diffInHours = diffInMs / (1000 * 60 * 60)
  
  if (diffInHours < 24) {
    return `I dag ${date.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`
  } else if (diffInHours < 48) {
    return `I går ${date.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`
  } else {
    return date.toLocaleDateString('nb-NO', { 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
}

export function getOwnerName(owner: 'person1' | 'person2' | 'person3', room: { person1_name: string, person2_name: string, person3_name: string }): string {
  return room[`${owner}_name`]
}
