var STATUS =
{ VALUE: 0 // now comes an object, array, string, or whatever else you can imagine
, ARRAY: 1
, STRING: 2
, NUMBER: 3
, TRUE: 4
, FALSE: 5
, NULL: 6
, OBJECT: 7
}

var STARTCHARS =
{ '"': STATUS.STRING
, '[': STATUS.ARRAY
, '{': STATUS.OBJECT
, 't': STATUS.TRUE
, 'f': STATUS.FALSE
, 'n': STATUS.NULL
}

function JSONStream(cb) {
  this.status = STATUS.VALUE
  this.stack = []
  this.callback = cb
  this.skip = 0
}

JSONStream.prototype.stackReturn = function(result) {
  var subContext = this.stack.pop()
  if (this.stack.length) {
    var parent = this.stack[this.stack.length-1]
    parent.subResult = result
    this.status = parent.type
  } else {
    this.callback(result)
    this.status = STATUS.VALUE
  }
}

JSONStream.prototype.parseMore = function(chunk) {
  for (var i=0; i<chunk.length;) {
    if (this.skip) {
      //console.log('skip '+chunk[i]+',left:'+this.skip)
      this.skip--
      i++
      continue
    }
    //console.log('i:'+i+',state:'+this.status)
    var char = chunk[i]
    var context = this.stack[this.stack.length - 1]
    var parentContext = this.stack[this.stack.length - 2]
    switch (this.status) {
      case STATUS.VALUE:
        if (STARTCHARS[char]) {
          this.stack.push({type: this.status = STARTCHARS[char]})
          i++
        } else if (('0' <= char && char <= '9') || char === '-')
          this.stack.push({type: this.status = STATUS.NUMBER})
        else
          throw new Error('parse error, unexpected value starter char 0x'+char.charCodeAt(0).toString(16))
        break
      case STATUS.ARRAY:
        if (context.subResult !== undefined) {
          (context.result || (context.result = [])).push(context.subResult)
          delete context.subResult
        }
        if (char === ']') {
          this.stackReturn(context.result || [])
          i++
        } else if (char === ',')
          i++ // do nothing
        else
          this.status = STATUS.VALUE
        break
      case STATUS.STRING:
        context.value = context.value || ""
        if (context.uescape) {
          context.uescape--
          context.uescapeValue += char
          if (!context.uescape)
            context.value += String.fromCharCode(parseInt(context.uescapeValue, 16))
          i++
        } else if (context.escaping) {
          context.escaping = false
          var ESCAPE_MAP =
          { '"': '"'
          , '\\': '\\'
          , '/': '/'
          , 'b': '\b'
          , 'f': '\f'
          , 'n': '\n'
          , 'r': '\r'
          , 't': '\t'
          }
          if (char in ESCAPE_MAP)
            context.value += ESCAPE_MAP[char]
          else if (char === 'u') {
            context.uescape = 4
            context.uescapeValue = ""
          } else
            throw new Error('invalid escape sequence')
          i++
        } else if (char === '\\') {
          context.escaping = true
          i++
        } else if (char === '"') {
          this.stackReturn(context.value)
          i++
        } else {
          context.value += char
          i++
        }
        break
      case STATUS.NUMBER:
        context.value = context.value || ""
        if (char==='-' || char==='+' || char==="e" || char==='E' || char==="." || (char>="0" && char<="9")) {
          context.value += char
          i++
        } else {
          this.stackReturn(parseFloat(context.value, 10))
        }
        break
      case STATUS.TRUE:
        this.stackReturn(true)
        this.skip = 3
        break
      case STATUS.FALSE:
        this.stackReturn(false)
        this.skip = 4
        break
      case STATUS.NULL:
        this.stackReturn(null)
        this.skip = 3
        break
      case STATUS.OBJECT: // subcases: now comes a key, now comes a value, end
        context.status = context.status || 'nextKey'
        if (context.status === 'keyDone') {
          if (context.subResult !== undefined) {
            context.key = context.subResult
            delete context.subResult
          }
          if (char === ':')
            i++
          else {
            this.status = STATUS.VALUE
            context.status = 'nextKey'
          }
        } else if (context.status === 'nextKey') {
          if (context.subResult !== undefined) {
            (context.result || (context.result = {}))[context.key] = context.subResult
            delete context.key
            delete context.subResult
          }
          if (char === '"') {
            this.stack.push({type: this.status = STATUS.STRING})
            context.status = 'keyDone'
            i++
          } else if (char === '}') {
            this.stackReturn(context.result || {})
            i++
          } else if (char === ',') {
            i++
          } else {
            throw new Error('invalid char 0x'+char.charCodeAt(0).toString(16)+' when next key or object end expected')
          }
        } else {
          throw new Error('unknown object parsing substatus '+context.status)
        }
        break
      default:
        throw new Error('unknown parser state '+this.status)
    }
  }
}

var test = new JSONStream(function (obj) {
  console.log(JSON.stringify(obj))
})
test.parseMore('[0.5e10,"foobar",null,true,false,{"a":1,"b":2}]')
