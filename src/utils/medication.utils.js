/**
 * Medication utility functions for parsing frequency and generating time slots
 */

/**
 * Parse frequency string into time slots array
 * @param {string} frequencyString - Frequency description (e.g., "Twice daily", "8AM, 12PM, 4PM, 8PM")
 * @returns {string[]} Array of time slots in HH:MM format (e.g., ["08:00", "20:00"])
 */
function parseFrequency(frequencyString) {
  if (!frequencyString || typeof frequencyString !== "string") {
    return [];
  }

  const frequency = frequencyString.trim().toLowerCase();

  // Handle "as needed" or PRN medications
  if (
    frequency.includes("as needed") ||
    frequency.includes("prn") ||
    frequency.includes("as required")
  ) {
    return [];
  }

  // Handle explicit time lists (e.g., "8AM, 12PM, 4PM, 8PM")
  if (frequency.includes(",") || frequency.match(/\d+\s*(am|pm)/i)) {
    const times = frequency
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    return times.map((time) => parseTimeString(time)).filter((t) => t);
  }

  // Handle "once daily" or "1x daily"
  if (
    frequency.includes("once daily") ||
    frequency.includes("1x daily") ||
    frequency.includes("once a day") ||
    frequency.includes("1x a day")
  ) {
    return ["08:00"];
  }

  // Handle "twice daily" or "2x daily"
  if (
    frequency.includes("twice daily") ||
    frequency.includes("2x daily") ||
    frequency.includes("twice a day") ||
    frequency.includes("2x a day") ||
    frequency.includes("bid")
  ) {
    return ["08:00", "20:00"];
  }

  // Handle "three times daily" or "3x daily"
  if (
    frequency.includes("three times daily") ||
    frequency.includes("3x daily") ||
    frequency.includes("three times a day") ||
    frequency.includes("3x a day") ||
    frequency.includes("tid")
  ) {
    return ["08:00", "14:00", "20:00"];
  }

  // Handle "four times daily" or "4x daily"
  // QID = Four times daily: 8AM, 12PM, 6PM, 10PM (every 6 hours)
  if (
    frequency.includes("four times daily") ||
    frequency.includes("4x daily") ||
    frequency.includes("four times a day") ||
    frequency.includes("4x a day") ||
    frequency.includes("qid")
  ) {
    return ["08:00", "12:00", "18:00", "22:00"];
  }

  // Handle 5ID, 6ID, 7ID (5, 6, 7 times per day)
  const multipleDailyMatch = frequency.match(/(\d+)id/);
  if (multipleDailyMatch) {
    const timesPerDay = parseInt(multipleDailyMatch[1], 10);
    if (timesPerDay === 5) {
      // 5ID: 8AM, 12PM, 4PM, 8PM, 12AM
      return ["08:00", "12:00", "16:00", "20:00", "00:00"];
    } else if (timesPerDay === 6) {
      // 6ID: 8AM, 12PM, 4PM, 8PM, 12AM, 4AM (every 4 hours)
      return ["08:00", "12:00", "16:00", "20:00", "00:00", "04:00"];
    } else if (timesPerDay === 7) {
      // 7ID: Approximately every 3.4 hours
      // Using evenly spaced calculation: 24/7 = 3.43 hours
      const times = [];
      const hoursPerDose = 24 / 7; // ~3.43 hours
      for (let i = 0; i < 7; i++) {
        const hour = (8 + i * hoursPerDose) % 24;
        times.push(formatTime(Math.floor(hour), Math.round((hour % 1) * 60)));
      }
      return times.sort((a, b) => {
        const [h1, m1] = a.split(":").map(Number);
        const [h2, m2] = b.split(":").map(Number);
        return h1 * 60 + m1 - (h2 * 60 + m2);
      });
    }
  }

  // Handle every X hours: Q30, Q1H, Q2H, Q3H, Q4H, Q6H, Q8H, Q12H
  const hourlyMatch = frequency.match(/q(\d+)(h|hr|hours?)?/);
  if (hourlyMatch) {
    const interval = parseInt(hourlyMatch[1], 10);
    if (interval === 30) {
      // Q30 = every 30 minutes
      const times = [];
      for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
        const hour = Math.floor(minutes / 60);
        const min = minutes % 60;
        times.push(formatTime(hour, min));
      }
      return times;
    } else if (interval >= 1 && interval <= 24) {
      // Q1H, Q2H, etc. = every X hours
      const times = [];
      let hour = 8; // Start at 8AM
      const maxIterations = Math.ceil(24 / interval);
      for (let i = 0; i < maxIterations; i++) {
        times.push(formatTime(hour, 0));
        hour = (hour + interval) % 24;
        if (hour === 8 && i > 0) break;
      }
      return times.sort((a, b) => {
        const [h1, m1] = a.split(":").map(Number);
        const [h2, m2] = b.split(":").map(Number);
        return h1 * 60 + m1 - (h2 * 60 + m2);
      });
    }
  }

  // Handle "every X hours" pattern
  const everyHoursMatch = frequency.match(/every\s+(\d+)\s+hours?/i);
  if (everyHoursMatch) {
    const hours = parseInt(everyHoursMatch[1], 10);
    if (hours > 0 && hours <= 24) {
      // Generate times based on 24-hour period starting at 8AM
      const times = [];
      let hour = 8; // Start at 8AM
      const maxIterations = Math.ceil(24 / hours);
      for (let i = 0; i < maxIterations; i++) {
        times.push(formatTime(hour, 0));
        hour = (hour + hours) % 24;
        if (hour === 8 && i > 0) break;
      }
      return times.sort((a, b) => {
        const [h1, m1] = a.split(":").map(Number);
        const [h2, m2] = b.split(":").map(Number);
        return h1 * 60 + m1 - (h2 * 60 + m2);
      });
    }
  }

  // Handle meal-related: AC, PC, QAM, QPM, HS
  if (frequency === "ac" || frequency.includes("before meals")) {
    return ["07:30", "11:30", "17:30"]; // 30 min before meals
  }
  if (frequency === "pc" || frequency.includes("after meals")) {
    return ["08:30", "12:30", "18:30"]; // 30 min after meals
  }
  if (frequency === "qam" || frequency.includes("morning")) {
    return ["08:00"];
  }
  if (frequency === "qpm" || frequency.includes("evening")) {
    return ["20:00"];
  }
  if (
    frequency === "hs" ||
    frequency.includes("bedtime") ||
    frequency.includes("at bedtime")
  ) {
    return ["22:00"];
  }

  // Handle QOD (every other day) - returns time slots, date filtering handled in schedule generation
  if (frequency === "qod" || frequency.includes("every other day")) {
    return ["08:00"]; // Time slots, but only generate for every other day
  }

  // Handle QOW (every other week) - returns time slots, week filtering handled in schedule generation
  if (frequency === "qow" || frequency.includes("every other week")) {
    return ["08:00"]; // Time slots, but only generate for every other week
  }

  // Handle odd/even days - returns time slots, date filtering handled in schedule generation
  if (frequency.includes("odd days") || frequency.includes("odd day")) {
    return ["08:00"]; // Time slots, but only generate for odd-numbered days
  }
  if (frequency.includes("even days") || frequency.includes("even day")) {
    return ["08:00"]; // Time slots, but only generate for even-numbered days
  }

  // Handle weekly schedules: 1QW, 2QW, 3QW, etc.
  const weeklyMatch = frequency.match(/(\d+)qw/);
  if (weeklyMatch) {
    const timesPerWeek = parseInt(weeklyMatch[1], 10);
    if (timesPerWeek >= 1 && timesPerWeek <= 7) {
      return ["08:00"]; // Time slots, weekday filtering handled in schedule generation
    }
  }

  // Handle monthly schedules: 1M, 2M, 3M, 4M
  const monthlyMatch = frequency.match(/(\d+)m$/);
  if (monthlyMatch) {
    const timesPerMonth = parseInt(monthlyMatch[1], 10);
    if (timesPerMonth >= 1 && timesPerMonth <= 4) {
      return ["08:00"]; // Time slots, day-of-month filtering handled in schedule generation
    }
  }

  // Default: return empty array if pattern not recognized
  return [];
}

/**
 * Parse a time string (e.g., "8AM", "12PM", "14:30") into HH:MM format
 * @param {string} timeString - Time string to parse
 * @returns {string|null} Time in HH:MM format or null if invalid
 */
function parseTimeString(timeString) {
  if (!timeString || typeof timeString !== "string") {
    return null;
  }

  const time = timeString.trim().toUpperCase();

  // Handle HH:MM format (e.g., "14:30", "08:00")
  const hhmmMatch = time.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmmMatch) {
    const hours = parseInt(hhmmMatch[1], 10);
    const minutes = parseInt(hhmmMatch[2], 10);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return formatTime(hours, minutes);
    }
  }

  // Handle AM/PM format (e.g., "8AM", "12PM", "2:30PM")
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

  // Handle 24-hour format without colon (e.g., "0800", "1430")
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
 * @param {number} hours - Hours (0-23)
 * @param {number} minutes - Minutes (0-59)
 * @returns {string} Time in HH:MM format
 */
function formatTime(hours, minutes) {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}`;
}

/**
 * Calculate number of times per day from frequency string
 * @param {string} frequencyString - Frequency description
 * @returns {number} Number of times per day
 */
function calculateTimesPerDay(frequencyString) {
  const timeSlots = parseFrequency(frequencyString);
  return timeSlots.length;
}

/**
 * Generate all scheduled times between startDate and endDate
 * @param {string[]} timeSlots - Array of time slots in HH:MM format
 * @param {Date} startDate - Start date
 * @param {Date|null} endDate - End date (null for no end)
 * @param {string} frequencyString - Optional frequency string for special filtering (QOD, QOW, monthly, weekly, odd/even days)
 * @returns {Date[]} Array of scheduled DateTime objects
 */
function generateTimeSlots(
  timeSlots,
  startDate,
  endDate = null,
  frequencyString = null
) {
  if (!timeSlots || timeSlots.length === 0) {
    return [];
  }

  const scheduledTimes = [];

  // Parse start date - ensure it's a Date object and get UTC date string
  let start;
  if (startDate instanceof Date) {
    const dateStr = startDate.toISOString().split("T")[0];
    start = new Date(dateStr + "T00:00:00.000Z");
  } else if (typeof startDate === "string") {
    const dateStr = startDate.split("T")[0];
    start = new Date(dateStr + "T00:00:00.000Z");
  } else {
    start = new Date(startDate);
    const dateStr = start.toISOString().split("T")[0];
    start = new Date(dateStr + "T00:00:00.000Z");
  }

  // Parse end date - ensure it's a Date object and get UTC date string
  let end = null;
  if (endDate) {
    if (endDate instanceof Date) {
      const dateStr = endDate.toISOString().split("T")[0];
      end = new Date(dateStr + "T23:59:59.999Z");
    } else if (typeof endDate === "string") {
      const dateStr = endDate.split("T")[0];
      end = new Date(dateStr + "T23:59:59.999Z");
    } else {
      end = new Date(endDate);
      const dateStr = end.toISOString().split("T")[0];
      end = new Date(dateStr + "T23:59:59.999Z");
    }
  }

  // Parse frequency for special filtering
  const frequency = frequencyString
    ? frequencyString.trim().toUpperCase()
    : null;

  // Generate times for each day using UTC
  let currentDate = new Date(start);
  const maxDays = end
    ? Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
    : 365; // Default to 1 year if no end date

  // Track for QOD (every other day) - need to track from start date
  let daysSinceStart = 0;
  const startDayOfMonth = start.getUTCDate();
  const startWeekday = start.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.

  for (let day = 0; day < maxDays; day++) {
    const currentDayOfMonth = currentDate.getUTCDate();
    const currentWeekday = currentDate.getUTCDay();
    const isOddDay = currentDayOfMonth % 2 === 1;
    const isEvenDay = currentDayOfMonth % 2 === 0;

    // Apply frequency-based date filtering
    let shouldIncludeDate = true;

    if (frequency) {
      // QOD (every other day)
      if (frequency === "QOD" || frequency.includes("EVERY OTHER DAY")) {
        shouldIncludeDate = daysSinceStart % 2 === 0;
      }
      // QOW (every other week) - compare week numbers
      else if (frequency === "QOW" || frequency.includes("EVERY OTHER WEEK")) {
        const weekNumber = Math.floor(daysSinceStart / 7);
        shouldIncludeDate = weekNumber % 2 === 0;
      }
      // Odd days
      else if (
        frequency.includes("ODD DAYS") ||
        frequency.includes("ODD DAY")
      ) {
        shouldIncludeDate = isOddDay;
      }
      // Even days
      else if (
        frequency.includes("EVEN DAYS") ||
        frequency.includes("EVEN DAY")
      ) {
        shouldIncludeDate = isEvenDay;
      }
      // Weekly schedules: 1QW, 2QW, 3QW, etc.
      else {
        const weeklyMatch = frequency.match(/(\d+)QW/);
        if (weeklyMatch) {
          const timesPerWeek = parseInt(weeklyMatch[1], 10);
          // Default: spread across weekdays (Monday=1 to Sunday=0,6)
          // For 1QW: Monday, 2QW: Mon/Tue, 3QW: Mon/Tue/Wed, etc.
          const weekdays = [];
          for (let i = 0; i < timesPerWeek; i++) {
            weekdays.push((1 + i) % 7); // Monday=1, Tuesday=2, ..., Sunday=0
          }
          shouldIncludeDate = weekdays.includes(currentWeekday);
        }
        // Monthly schedules: 1M, 2M, 3M, 4M
        else {
          const monthlyMatch = frequency.match(/(\d+)M$/);
          if (monthlyMatch) {
            const timesPerMonth = parseInt(monthlyMatch[1], 10);
            const dayPatterns = {
              1: [1],
              2: [1, 15],
              3: [1, 10, 20],
              4: [1, 8, 15, 22],
            };
            const targetDays = dayPatterns[timesPerMonth] || [1];
            shouldIncludeDate = targetDays.includes(currentDayOfMonth);
          }
        }
      }
    }

    if (shouldIncludeDate) {
      for (const timeSlot of timeSlots) {
        const [hours, minutes] = timeSlot.split(":").map(Number);

        // Create UTC date for this time slot
        const dateStr = currentDate.toISOString().split("T")[0];
        const scheduledTime = new Date(
          `${dateStr}T${String(hours).padStart(2, "0")}:${String(
            minutes
          ).padStart(2, "0")}:00.000Z`
        );

        // Skip if before start date
        if (scheduledTime < start) {
          continue;
        }

        // Stop if after end date
        if (end && scheduledTime > end) {
          return scheduledTimes;
        }

        scheduledTimes.push(scheduledTime);
      }
    }

    // Move to next day in UTC
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    daysSinceStart++;
  }

  return scheduledTimes;
}

module.exports = {
  parseFrequency,
  parseTimeString,
  formatTime,
  calculateTimesPerDay,
  generateTimeSlots,
};
