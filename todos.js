const config = require("./lib/config");
const express = require("express");
const morgan = require("morgan");
const flash = require("express-flash");
const session = require("express-session");
const { body, validationResult } = require("express-validator");
const store = require("connect-loki");
const PgPersistence = require("./lib/pg-persistence");
const catchError = require("./lib/catch-error");

const app = express();
const host = config.HOST;
const port = config.PORT;
const LokiStore = store(session);

app.set("views", "./views");
app.set("view engine", "pug");

app.use(morgan("common"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 31 * 24 * 60 * 60 * 1000,
    path: "/",
    secure: false,
  },
  name: "launch-school-todos-session-id",
  resave: false,
  saveUninitialized: true,
  secret: config.SECRET,
  store: new LokiStore({}),
}));
app.use(flash());

app.use((req, res, next) => {
  res.locals.store = new PgPersistence(req.session);
  next();
});

app.use((req, res, next) => {
  res.locals.username = req.session.username;
  res.locals.signedIn = req.session.signedIn;
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

const requiresAuthentication = (req, res, next) => {
  if (!res.locals.signedIn) {
    res.status(401).redirect("/users/signin");
  } else {
    next();
  }
};

app.get("/", (req, res) => {
  res.redirect("/lists");
});

app.get("/lists", 
  requiresAuthentication,
  catchError(async (req, res) => {
    let store = res.locals.store;
    let todoLists = await store.sortedTodoLists();
  
    let todosInfo = todoLists.map(todoList => ({
      countAllTodos: todoList.todos.length,
      countDoneTodos: todoList.todos.filter(todo => todo.done).length,
      isDone: store.isDoneTodoList(todoList),
    }));
  
    res.render("lists", {
      todoLists,
      todosInfo,
    });
  })
);

app.get("/lists/new", 
  requiresAuthentication,
  (req, res) => {
    res.render("new-list");
  }
);

app.get("/lists/:todoListId", 
  requiresAuthentication,
  catchError(async (req, res) => {
    if (!req.session.signedIn) res.redirect("/users/signin");
    let store = res.locals.store;
    let todoListId = req.params.todoListId;
    let todoList = await store.loadTodoList(+todoListId);
    if (!todoList) throw new Error(`Not found.`);
    let todoListInfo = {
      isDone: store.isDoneTodoList(todoList),
      hasUndoneTodos: store.hasUndoneTodos(todoList),
      title: todoList.title,
      id: todoList.id,
    };
    res.render("list", {
      todoListInfo,
      todos: await store.sortedTodos(todoList),
    });
  })
);

app.get("/lists/:todoListId/edit", 
  requiresAuthentication,
  catchError(async (req, res, next) => {
    let todoList = await res.locals.store.loadTodoList(+req.params.todoListId);
    if (!todoList) next(new Error("Not found."));
    else {
      res.render("edit-list", { todoList });  
    }
  })
);

app.post("/lists/:todoListId/edit", 
  requiresAuthentication,
  [
    body("todoListTitle")
    .trim()
    .isLength({ min: 1 })
    .withMessage("The list title is required.")
    .isLength({ max: 100 })
    .withMessage("List title must be between 1 and 100 characters")
  ],
  catchError(async (req, res) => {
    let todoListId = req.params.todoListId;
    let store = res.locals.store;
    let todoListTitle = req.body.todoListTitle;

    const rerenderEditList = async () => {
      let todoList = await store.loadTodoList(+todoListId);
      if (!todoList) {
        next(new Error("Not found."));
      } else {
        res.render("edit-list", {
          flash: req.flash(),
          todoList,
          todoListTitle,
        });
      }
    };
    try {
      let errors = validationResult(req);
      if (!errors.isEmpty()) {
        errors.array().forEach(message => req.flash("error", message.msg));
        await rerenderEditList();
      } else if (await store.existsTodoListTitle(todoListTitle)) {
        req.flash("error", "The list title must be unique.");
        await rerenderEditList();      
      } else if (!await store.setTodoListTitle(+todoListId, todoListTitle)) {
        throw new Error("Not found.");
      } else {
        req.flash("success", "Todo list title updated.")
        res.redirect(`/lists/${todoListId}`);
      }
    } catch (error) {
      if (store.isUniqueConstraintViolation(error)) {
        req.flash("error", "The list title must be unique.");
        await rerenderEditList();
      } else {
        throw error;
      }
    }
  })
);

app.post("/lists/:todoListId/destroy",
  requiresAuthentication,
  catchError(async (req, res) => {
    let deleted = await res.locals.store.deleteTodoList(+req.params.todoListId);
    if (!deleted) next(new Error("Not found."));
    else {
      req.flash("success", `Todo list has been deleted`);
      res.redirect("/lists");
    }
  })
)

app.post("/lists/:todoListId/complete_all", 
  requiresAuthentication,
  catchError(async (req, res) => {
    let todoListId = req.params.todoListId;
    if (!res.locals.store.markAllDone(+todoListId)) throw new Error("Not found.");
    req.flash("success", `All todos have been marked done`);
    res.redirect(`/lists/${todoListId}`);
  })
);

app.post("/lists/:todoListId/todos/:todoId/toggle", 
  requiresAuthentication,
  catchError(async (req, res) => {
    let { todoListId, todoId } = req.params;
    let store = res.locals.store;
    let toggled = await store.toggleTodo(+todoListId, +todoId);
    if (!toggled) throw new Error("Not found.");

    let todo = await store.loadTodo(+todoListId, +todoId);
    if (!todo.done) {
      req.flash("success", `${todo.title} has been marked NOT done`);
    }
    else {
      req.flash("success", `${todo.title} has been marked done`);
    }
    
    res.redirect(`/lists/${todoListId}`);
  })
);

app.post("/lists/:todoListId/todos/:todoId/destroy", 
  requiresAuthentication,
  catchError(async (req, res) => {
    let { todoListId, todoId } = req.params;
    let store = res.locals.store;
    let deleted = store.deleteTodo(+todoListId, +todoId);
    if (!deleted) throw new Error("Not found.");
    req.flash("success", `Todo has been deleted`);
    res.redirect(`/lists/${todoListId}`);
  })
);

app.post("/lists/:todoListId/todos", 
  requiresAuthentication,
  [  body("todoTitle")
    .trim()
    .isLength({ min: 1 })
    .withMessage("The todo title is required.")
    .isLength({ max: 100 })
    .withMessage("Todo title must be between 1 and 100 characters")
  ],
  catchError(async (req, res, next) => {
    let todoListId = req.params.todoListId;
    let store = res.locals.store;
    let todoList = store.loadTodoList(+todoListId);
    if (!todoList) next(new Error("Not found."));

    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      let todoListInfo = {
        isDone: store.isDoneTodoList(todoList),
        hasUndoneTodos: store.hasUndoneTodos(todoList),
        title: todoList.title,
        id: todoList.id,
      };
      res.render("list", {
        flash: req.flash(),
        todoListInfo,
        todos: await store.sortedTodos(todoList),
        todoTitle: req.body.todoTitle,
      });
    } else {
      await store.addTodo(+todoListId, req.body.todoTitle);
      req.flash("success", `Todo has been created!`);
      res.redirect(`/lists/${todoListId}`);
    }
  })
);

app.post("/lists",
  requiresAuthentication,
  [
    body("todoListTitle")
    .trim()
    .isLength({ min: 1 })
    .withMessage("The list title is required.")
    .isLength({ max: 100 })
    .withMessage("List title must be between 1 and 100 characters")
  ],
  catchError(async (req, res) => {
    let todoListTitle = req.body.todoListTitle;
    let store = res.locals.store;
    let errors = validationResult(req);

    const rerenderList = () => {
      res.render("new-list", {
        flash: req.flash(),
        todoListTitle,
      });
    };

    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      rerenderList();
    } else if (await store.existsTodoListTitle(todoListTitle)) {
      req.flash("error", "The list title must be unique.");
      rerenderList();
    } else {
      let created = await store.addTodoList(todoListTitle);
      if (!created) {
        throw new Error("Failed to create todo list.");
      } else {
        req.flash("success", "The todo list has been created.");
        res.redirect("/lists");
      }
    }    
  })
);

app.get("/users/signin", (req, res) => {
  req.flash("info", "Please sign in.");
  res.render("signin", {
    flash: req.flash(),
  });
});

app.post("/users/signin", [
  body("username")
  .trim()
  ],
  catchError(async (req, res) => {
    let username = req.body.username;
    let password = req.body.password;
    if (!await res.locals.store.validateCredentials(username, password)) {
      req.flash("info", "Invalid credentials.");
      res.render("signin", {
        flash: req.flash(),
        username
      });
    } else {
      req.session.username = username;
      req.session.signedIn = true;
      req.flash("success", "Welcome!");
      res.redirect("/lists");
    }
  })
)

app.post("/users/signout", (req, res) => {
  delete req.session.username;
  delete req.session.signedIn;
  res.redirect("/users/signin");
})

app.use((err, req, res, next) => {
  console.log(err);
  res.status(404).send(err.message);
});

app.listen(port, host, () => {
  console.log(`Todos is listening on port ${port} of ${host}!`);
});