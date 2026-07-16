/**
 * Enhanced medication frequency parser
 * Supports all frequency codes: Monthly, Weekly, Odd/Even days, Every X hours, QOD, QOW, AC/PC/QAM/QPM/HS, etc.
 */

/**
 * Parse frequency string and return frequency metadata
 * @param {string} frequencyString - Frequency description
 * @returns {Object} Frequency metadata with type, timeSlots, and special properties
 */
function parseFrequency(frequencyString) {
  if (!frequencyString || typeof frequencyString !== "string") {
    return { type: "UNKNOWN", timeSlots: [], metadata: {} };
  }

  const frequency = frequencyString.trim().toUpperCase();

  // Handle PRN medications
  if (
    frequency.includes("PRN") ||
    frequency.includes("AS NEEDED") ||
    frequency.includes("AS REQUIRED")
  ) {
    return { type: "PRN", timeSlots: [], metadata: {} };
  }

  // Handle explicit time lists (e.g., "8AM, 12PM, 4PM, 8PM")
  if (frequency.includes(",") || frequency.match(/\d+\s*(AM|PM)/)) {
    const times = frequency
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const timeSlots = times
      .map((time) => parseTimeString(time))
      .filter((t) => t);
    return { type: "CUSTOM", timeSlots, metadata: {} };
  }

  // Handle daily multiples: QD, BID, TID, QID, 5ID, 6ID, 7ID
  if (frequency === "QD" || frequency.match(/^ONCE\s*(DAILY|A\s*DAY)?$/i)) {
    return { type: "DAILY", timeSlots: ["08:00"], metadata: { timesPerDay: 1 } };
  }
  if (frequency === "BID" || frequency.match(/^TWICE\s*(DAILY|A\s*DAY)?$/i)) {
    return { type: "DAILY", timeSlots: ["08:00", "20:00"], metadata: { timesPerDay: 2 } };
  }
  if (frequency === "TID" || frequency.match(/^THREE\s*TIMES\s*(DAILY|A\s*DAY)?$/i)) {
    return { type: "DAILY", timeSlots: ["08:00", "14:00", "20:00"], metadata: { timesPerDay: 3 } };
  }
  if (frequency === "QID" || frequency.match(/^FOUR\s*TIMES\s*(DAILY|A\s*DAY)?$/i)) {
    return { type: "DAILY", timeSlots: ["08:00", "12:00", "16:00", "20:00"], metadata: { timesPerDay: 4 } };
  }

  // Handle 5ID, 6ID, 7ID
  const multipleDailyMatch = frequency.match(/^(\d+)ID$/);
  if (multipleDailyMatch) {
    const timesPerDay = parseInt(multipleDailyMatch[1], 10);
    if (timesPerDay >= 1 && timesPerDay <= 7) {
      const timeSlots = generateEvenlySpacedTimes(timesPerDay);
      return { type: "DAILY", timeSlots, metadata: { timesPerDay } };
    }
  }

  // Handle every X hours: Q30, Q1H, Q2H, Q3H, Q4H, Q6H, Q8H, Q12H
  const hourlyMatch = frequency.match(/^Q(\d+)(H|HR|HOURS?)?$/);
  if (hourlyMatch) {
    const interval = parseInt(hourlyMatch[1], 10);
    if (interval === 30) {
      // Q30 = every 30 minutes
      return { type: "HOURLY", timeSlots: generateEveryXMinutes(30), metadata: { intervalMinutes: 30 } };
    } else if (interval >= 1 && interval <= 24) {
      // Q1H, Q2H, etc. = every X hours
      return { type: "HOURLY", timeSlots: generateEveryXHours(interval), metadata: { intervalHours: interval } };
    }
  }

  // Handle "every X hours" pattern
  const everyHoursMatch = frequency.match(/EVERY\s+(\d+)\s*(HOURS?|HR)/i);
  if (everyHoursMatch) {
    const hours = parseInt(everyHoursMatch[1], 10);
    if (hours > 0 && hours <= 24) {
      return { type: "HOURLY", timeSlots: generateEveryXHours(hours), metadata: { intervalHours: hours } };
    }
  }

  // Handle meal-related: AC, PC, QAM, QPM, HS
  if (frequency === "AC" || frequency.includes("BEFORE MEALS")) {
    // AC = before meals (typically 30 min before: 7:30, 11:30, 17:30)
    return { type: "MEAL_RELATED", timeSlots: ["07:30", "11:30", "17:30"], metadata: { mealType: "AC" } };
  }
  if (frequency === "PC" || frequency.includes("AFTER MEALS")) {
    // PC = after meals (typically 30 min after: 8:30, 12:30, 18:30)
    return { type: "MEAL_RELATED", timeSlots: ["08:30", "12:30", "18:30"], metadata: { mealType: "PC" } };
  }
  if (frequency === "QAM" || frequency.includes("MORNING")) {
    return { type: "DAILY", timeSlots: ["08:00"], metadata: { timeOfDay: "MORNING" } };
  }
  if (frequency === "QPM" || frequency.includes("EVENING")) {
    return { type: "DAILY", timeSlots: ["20:00"], metadata: { timeOfDay: "EVENING" } };
  }
  if (frequency === "HS" || frequency.includes("BEDTIME") || frequency.includes("AT BEDTIME")) {
    return { type: "DAILY", timeSlots: ["22:00"], metadata: { timeOfDay: "BEDTIME" } };
  }

  // Handle every other day: QOD
  if (frequency === "QOD" || frequency.includes("EVERY OTHER DAY")) {
    return { type: "EVERY_OTHER_DAY", timeSlots: ["08:00"], metadata: { interval: 2 } };
  }

  // Handle every other week: QOW
  if (frequency === "QOW" || frequency.includes("EVERY OTHER WEEK")) {
    return { type: "EVERY_OTHER_WEEK", timeSlots: ["08:00"], metadata: { interval: 2 } };
  }

  // Handle odd/even days
  if (frequency.includes("ODD DAYS") || frequency.includes("ODD DAY")) {
    return { type: "ODD_DAYS", timeSlots: ["08:00"], metadata: { dayType: "ODD" } };
  }
  if (frequency.includes("EVEN DAYS") || frequency.includes("EVEN DAY")) {
    return { type: "EVEN_DAYS", timeSlots: ["08:00"], metadata: { dayType: "EVEN" } };
  }

  // Handle weekly schedules: 1QW, 2QW, 3QW, etc.
  const weeklyMatch = frequency.match(/^(\d+)QW$/);
  if (weeklyMatch) {
    const timesPerWeek = parseInt(weeklyMatch[1], 10);
    if (timesPerWeek >= 1 && timesPerWeek <= 7) {
      // Default to Monday for 1QW, spread across weekdays for more
      const weekdays = [1, 2, 3, 4, 5, 6, 7]; // Monday to Sunday
      const selectedDays = weekdays.slice(0, timesPerWeek);
      return {
        type: "WEEKLY",
        timeSlots: ["08:00"],
        metadata: { timesPerWeek, weekdays: selectedDays },
      };
    }
  }

  // Handle monthly schedules: 1M, 2M, 3M, 4M
  const monthlyMatch = frequency.match(/^(\d+)M$/);
  if (monthlyMatch) {
    const timesPerMonth = parseInt(monthlyMatch[1], 10);
    if (timesPerMonth >= 1 && timesPerMonth <= 4) {
      // Default days: 1M = 1st, 2M = 1st & 15th, 3M = 1st, 10th, 20th, 4M = 1st, 8th, 15th, 22nd
      const dayPatterns = {
        1: [1],
        2: [1, 15],
        3: [1, 10, 20],
        4: [1, 8, 15, 22],
      };
      return {
        type: "MONTHLY",
        timeSlots: ["08:00"],
        metadata: { timesPerMonth, daysOfMonth: dayPatterns[timesPerMonth] || [1] },
      };
    }
  }

  // Legacy support for text-based frequencies
  if (frequency.includes("ONCE DAILY") || frequency.includes("1X DAILY")) {
    return { type: "DAILY", timeSlots: ["08:00"], metadata: { timesPerDay: 1 } };
  }
  if (frequency.includes("TWICE DAILY") || frequency.includes("2X DAILY")) {
    return { type: "DAILY", timeSlots: ["08:00", "20:00"], metadata: { timesPerDay: 2 } };
  }
  if (frequency.includes("THREE TIMES DAILY") || frequency.includes("3X DAILY")) {
    return { type: "DAILY", timeSlots: ["08:00", "14:00", "20:00"], metadata: { timesPerDay: 3 } };
  }
  if (frequency.includes("FOUR TIMES DAILY") || frequency.includes("4X DAILY")) {
    return { type: "DAILY", timeSlots: ["08:00", "12:00", "16:00", "20:00"], metadata: { timesPerDay: 4 } };
  }

  // Default: return empty
  return { type: "UNKNOWN", timeSlots: [], metadata: {} };
}

/**
 * Generate evenly spaced times throughout the day
 * @param {number} timesPerDay - Number of times per day (1-7)
 * @returns {string[]} Array of time slots in HH:MM format
 */
function generateEvenlySpacedTimes(timesPerDay) {
  const times = [];
  const startHour = 8; // Start at 8 AM
  const hoursPerDose = 24 / timesPerDay;

  for (let i = 0; i < timesPerDay; i++) {
    const hour = (startHour + i * hoursPerDose) % 24;
    times.push(formatTime(Math.floor(hour), Math.round((hour % 1) * 60)));
  }

  return times.sort((a, b) => {
    const [h1, m1] = a.split(":").map(Number);
    const [h2, m2] = b.split(":").map(Number);
    return h1 * 60 + m1 - (h2 * 60 + m2);
  });
}

/**
 * Generate times every X hours starting at 8 AM
 * @param {number} intervalHours - Hours between doses
 * @returns {string[]} Array of time slots
 */
function generateEveryXHours(intervalHours) {
  const times = [];
  let hour = 8; // Start at 8 AM
  const maxIterations = Math.ceil(24 / intervalHours);

  for (let i = 0; i < maxIterations; i++) {
    times.push(formatTime(hour, 0));
    hour = (hour + intervalHours) % 24;
    if (hour === 8 && i > 0) break; // Stop if we've completed a full cycle
  }

  return times.sort((a, b) => {
    const [h1, m1] = a.split(":").map(Number);
    const [h2, m2] = b.split(":").map(Number);
    return h1 * 60 + m1 - (h2 * 60 + m2);
  });
}

/**
 * Generate times every X minutes (for Q30)
 * @param {number} intervalMinutes - Minutes between doses
 * @returns {string[]} Array of time slots
 */
function generateEveryXMinutes(intervalMinutes) {
  const times = [];
  const startMinutes = 8 * 60; // 8 AM in minutes
  const totalMinutes = 24 * 60; // 24 hours in minutes

  for (let minutes = startMinutes; minutes < startMinutes + totalMinutes; minutes += intervalMinutes) {
    const hour = Math.floor((minutes % totalMinutes) / 60);
    const min = (minutes % totalMinutes) % 60;
    times.push(formatTime(hour, min));
  }

  return times;
}

/**
 * Parse a time string into HH:MM format
 */
function parseTimeString(timeString) {
  if (!timeString || typeof timeString !== "string") {
    return null;
  }

  const time = timeString.trim().toUpperCase();

  // Handle HH:MM format
  const hhmmMatch = time.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmmMatch) {
    const hours = parseInt(hhmmMatch[1], 10);
    const minutes = parseInt(hhmmMatch[2], 10);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return formatTime(hours, minutes);
    }
  }

  // Handle AM/PM format
  const ampmMatch = time.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2] || "0", 10);
    const period = ampmMatch[3];

    if (period === "PM" && hours !== 12) {
      hours += 12;
    } else if (period === "AM" && hours === 12) {
      hours = 0;
    }

    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return formatTime(hours, minutes);
    }
  }

  // Handle 24-hour format without colon
  const hhmmNoColonMatch = time.match(/^(\d{3,4})$/);
  if (hhmmNoColonMatch) {
    const timeStr = hhmmNoColonMatch[1].padStart(4, "0");
    const hours = parseInt(timeStr.substring(0, 2), 10);
    const minutes = parseInt(timeStr.substring(2, 4), 10);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return formatTime(hours, minutes);
    }
  }

  return null;
}

/**
 * Format hours and minutes into HH:MM format
 */
function formatTime(hours, minutes) {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Calculate number of times per day from frequency string
 */
function calculateTimesPerDay(frequencyString) {
  const parsed = parseFrequency(frequencyString);
  if (parsed.type === "DAILY" && parsed.metadata.timesPerDay) {
    return parsed.metadata.timesPerDay;
  }
  return parsed.timeSlots.length;
}

module.exports = {
  parseFrequency,
  parseTimeString,
  formatTime,
  calculateTimesPerDay,
};

